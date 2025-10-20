export const runtime = "edge";

import { NextRequest } from "next/server";

/**
 * Extrai texto de uma mensagem do Assistants v2
 * (content geralmente é uma lista com partes; prioriza "output_text")
 */
function extractTextFromMessage(msg: any): string {
  if (Array.isArray(msg?.content)) {
    let out = "";
    for (const c of msg.content) {
      if (c?.type === "output_text" && c?.text?.value) out += c.text.value;
      else if (c?.type === "text" && c?.text?.value) out += c.text.value;
      else if (c?.type === "input_text" && c?.text) out += c.text;
    }
    return out.trim();
  }
  const maybe =
    msg?.content?.[0]?.text?.value ||
    msg?.content?.[0]?.text ||
    msg?.content ||
    "";
  return (maybe || "").toString().trim();
}

export async function POST(req: NextRequest) {
  const { message, threadId } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    return new Response(
      JSON.stringify({
        error:
          "Faltam variáveis de ambiente: OPENAI_API_KEY e/ou ASSISTANT_ID.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let currentThreadId: string | null = threadId || null;

  // Cabeçalhos base para Assistants v2
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };

  try {
    // 1) Cria a Thread se necessário
    if (!currentThreadId) {
      const th = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: baseHeaders,
      });
      if (!th.ok) {
        return new Response(await th.text(), { status: 500 });
      }
      const thData = await th.json();
      currentThreadId = thData.id as string;
    }

    // 2) Adiciona a mensagem do usuário na Thread
    {
      const addMsg = await fetch(
        `https://api.openai.com/v1/threads/${currentThreadId}/messages`,
        {
          method: "POST",
          headers: baseHeaders,
          body: JSON.stringify({
            role: "user",
            content: [{ type: "text", text: message }],
          }),
        }
      );
      if (!addMsg.ok) {
        return new Response(await addMsg.text(), { status: 500 });
      }
    }

    // 3) Inicia o Run com STREAMING habilitado e formato textual forçado
    const runRes = await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/runs`,
      {
        method: "POST",
        headers: { ...baseHeaders, Accept: "text/event-stream" },
        body: JSON.stringify({
          assistant_id: assistantId,
          stream: true, // <- essencial ao usar REST genérico
          response_format: { type: "text" }, // <- força saída textual
        }),
      }
    );

    if (!runRes.ok || !runRes.body) {
      const errText = await runRes.text();
      return new Response(errText || "Erro ao iniciar o Run.", { status: 500 });
    }

    // 4) Faz proxy do SSE para o cliente + Fallback se não houver deltas
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      start(controller) {
        // Envia o threadId ao cliente logo no início
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ threadId: currentThreadId })}\n\n`
          )
        );

        const reader = runRes.body!.getReader();
        let emittedText = false; // marca se algum delta foi enviado ao cliente

        (async function pump() {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              // Cada "frame" SSE é separado por linha em branco (\n\n)
              const frames = chunk.split("\n\n");

              for (const frame of frames) {
                if (!frame?.trim()) continue;

                const lines = frame.split("\n");
                let eventName = "";
                let dataStr = "";

                for (const l of lines) {
                  const line = l.trim();
                  if (!line) continue;
                  if (line.startsWith("event:"))
                    eventName = line.slice(6).trim();
                  if (line.startsWith("data:")) dataStr = line.slice(5).trim();
                }

                if (!dataStr) continue;

                // Encerramento do stream
                if (dataStr === "[DONE]") {
                  break;
                }

                // Tenta parsear cada `data:` como JSON
                try {
                  const data = JSON.parse(dataStr);

                  // Caso 1: evento semântico da Responses API propagado via Assistants:
                  // response.output_text.delta -> { delta: string }
                  if (
                    data.type === "response.output_text.delta" &&
                    typeof data.delta === "string"
                  ) {
                    emittedText = true;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          delta: data.delta,
                          threadId: currentThreadId,
                        })}\n\n`
                      )
                    );
                    continue;
                  }

                  // Caso 2: Assistants v2 - deltas de mensagem
                  // thread.message.delta / message.delta -> delta.content[...]
                  if (
                    (eventName.includes("message.delta") ||
                      data.type === "message.delta" ||
                      data.type === "thread.message.delta") &&
                    data.delta
                  ) {
                    const delta = data.delta;
                    if (Array.isArray(delta.content)) {
                      for (const c of delta.content) {
                        if (c?.type === "output_text" && c?.text?.value) {
                          emittedText = true;
                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify({
                                delta: c.text.value,
                                threadId: currentThreadId,
                              })}\n\n`
                            )
                          );
                        } else if (c?.type === "text_delta" && c?.text) {
                          emittedText = true;
                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify({
                                delta: c.text,
                                threadId: currentThreadId,
                              })}\n\n`
                            )
                          );
                        } else if (c?.type === "text" && typeof c?.text === "string") {
                          emittedText = true;
                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify({
                                delta: c.text,
                                threadId: currentThreadId,
                              })}\n\n`
                            )
                          );
                        }
                      }
                    }
                    continue;
                  }

                  // Caso 3: eventos de término (completou mensagem/resposta)
                  if (
                    data.type === "response.completed" ||
                    data.type === "message.completed" ||
                    eventName.includes("completed")
                  ) {
                    // não encerramos aqui — deixamos o loop terminar e executar o fallback se necessário
                  }

                  // Caso 4: algum erro veio como evento
                  if (data.type === "error" && data.error?.message) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          error: data.error.message,
                          threadId: currentThreadId,
                        })}\n\n`
                      )
                    );
                  }
                } catch {
                  // frame não-JSON ou keep-alive -> ignore
                }
              }
            }

            // 5) Fallback: se nenhum delta foi emitido, busca a última mensagem da thread
            (async () => {
              try {
                if (!emittedText && currentThreadId) {
                  const last = await fetch(
                    `https://api.openai.com/v1/threads/${currentThreadId}/messages?limit=5&order=desc`,
                    { headers: baseHeaders }
                  );
                  if (last.ok) {
                    const j = await last.json();
                    const list = Array.isArray(j?.data) ? j.data : [];
                    const firstAssistant = list.find(
                      (m: any) => m?.role === "assistant"
                    );
                    const text = firstAssistant
                      ? extractTextFromMessage(firstAssistant)
                      : "";

                    if (text) {
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({
                            delta: text,
                            threadId: currentThreadId,
                          })}\n\n`
                        )
                      );
                    } else {
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({
                            error:
                              "O Assistente não retornou texto (apenas tool-calls).",
                            threadId: currentThreadId,
                          })}\n\n`
                        )
                      );
                    }
                  } else {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          error: await last.text(),
                          threadId: currentThreadId,
                        })}\n\n`
                      )
                    );
                  }
                }
              } catch (e: any) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      error: e?.message || "Falha no fallback",
                      threadId: currentThreadId,
                    })}\n\n`
                  )
                );
              } finally {
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                controller.close();
              }
            })();
          } catch (e: any) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: e?.message || "Erro no stream",
                  threadId: currentThreadId,
                })}\n\n`
              )
            );
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          }
        })();
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return new Response(
      `data: ${JSON.stringify({
        error: e?.message || "Erro interno",
        threadId: currentThreadId,
      })}\n\n`,
      {
        status: 500,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }
}
