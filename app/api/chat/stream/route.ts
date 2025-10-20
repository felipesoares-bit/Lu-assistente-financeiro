export const runtime = "edge";

import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { message, threadId } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.ASSISTANT_ID;
  if (!apiKey || !assistantId) {
    return new Response("Faltam variáveis OPENAI_API_KEY ou ASSISTANT_ID", { status: 500 });
  }

  let currentThreadId = (threadId as string) || null;

  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2"
  };

  try {
    // 1) Cria Thread (se necessário)
    if (!currentThreadId) {
      const th = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: baseHeaders
      });
      if (!th.ok) return new Response(await th.text(), { status: 500 });
      const thData = await th.json();
      currentThreadId = thData.id;
    }

    // 2) Adiciona mensagem do usuário
    const addMsg = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        role: "user",
        content: [{ type: "text", text: message }]
      })
    });
    if (!addMsg.ok) return new Response(await addMsg.text(), { status: 500 });

    // 3) Inicia Run com streaming via SSE (sem "stream: true" no body)
    const runRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
      method: "POST",
      headers: { ...baseHeaders, Accept: "text/event-stream" },
      body: JSON.stringify({ 
        assistant_id: assistantId,
        stream: true,
        response_format: { type: "text" }
      })
    });

    if (!runRes.ok || !runRes.body) {
      return new Response(await runRes.text(), { status: 500 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      start(controller) {
        // Envia threadId logo no início
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ threadId: currentThreadId })}\n\n`));

        const reader = runRes.body!.getReader();

        (async function pump() {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const frames = chunk.split("\n\n"); // SSE frames

              for (const frame of frames) {
                const lines = frame.split("\n");
                let eventName = "";
                let dataStr = "";

                for (const l of lines) {
                  if (l.startsWith("event:")) eventName = l.slice(6).trim();
                  if (l.startsWith("data:")) dataStr = l.slice(5).trim();
                }

                if (!dataStr) continue;
                if (dataStr === "[DONE]") {
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                  controller.close();
                  return;
                }

                try {
                  const data = JSON.parse(dataStr);

                  // Deltas de texto (tipos comuns no v2)
                  if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: data.delta, threadId: currentThreadId })}\n\n`));
                    continue;
                  }

                  if ((eventName.includes("message.delta") || data.type === "message.delta" || data.type === "thread.message.delta") && data.delta) {
                    const delta = data.delta;
                    if (Array.isArray(delta.content)) {
                      for (const c of delta.content) {
                        if (c?.type === "output_text" && c?.text?.value) {
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: c.text.value, threadId: currentThreadId })}\n\n`));
                        } else if (c?.type === "text_delta" && c?.text) {
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: c.text, threadId: currentThreadId })}\n\n`));
                        }
                      }
                    }
                    continue;
                  }

                  if (data.type === "response.completed" || data.type === "message.completed") {
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                    return;
                  }

                  // Se houver erro do lado da OpenAI em formato de evento
                  if (data.type === "error" && data.error?.message) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: data.error.message })}\n\n`));
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                    return;
                  }
                } catch {
                  // frames não-JSON: ignore
                }
              }
            }
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (e: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e?.message || "stream error" })}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          }
        })();
      }
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e: any) {
    return new Response(`data: ${JSON.stringify({ error: e?.message || "internal error" })}\n\n`, {
      status: 500,
      headers: { "Content-Type": "text/event-stream" }
    });
  }
}
