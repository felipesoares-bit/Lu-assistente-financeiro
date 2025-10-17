"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import MessageBubble from "./MessageBubble";

type Role = "user" | "assistant";
interface Msg { id: string; role: Role; content: string }

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Olá! Eu sou a Lu, sua assistente financeira. Como posso ajudar hoje?"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll a cada nova mensagem
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Carrega threadId salvo (persistência entre reloads)
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("lu_thread_id") : null; // [persist]
    if (saved) setThreadId(saved); // [persist]
  }, []);

  // Sincroniza alterações de threadId com o localStorage
  useEffect(() => {
    if (threadId) { // [persist]
      try { localStorage.setItem("lu_thread_id", threadId); } catch {} // [persist]
    }
  }, [threadId]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    const asstMsg: Msg = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const asstId = asstMsg.id;

    setMessages(prev => [...prev, userMsg, asstMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, threadId })
      });

      if (!res.ok || !res.body) {
        throw new Error(await res.text());
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let newThreadId: string | null = threadId;

      // Parser com buffer para frames SSE parciais
      let buffer = "";

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });

          // Processa frames completos separados por \n\n
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 2);

            // Frame pode conter várias linhas: event: ..., data: ...
            const lines = frame.split("\n");
            for (const raw of lines) {
              const line = raw.trim();
              if (!line.startsWith("data:")) continue;

              const dataStr = line.slice(5).trim();
              if (!dataStr) continue;

              if (dataStr === "[DONE]") {
                done = true;
                break;
              }

              try {
                const json = JSON.parse(dataStr);

                // Recebe o threadId do servidor no início do stream
                if (json.threadId && !newThreadId) {
                  newThreadId = json.threadId;
                  try { localStorage.setItem("lu_thread_id", newThreadId); } catch {} // [persist]
                }

                // Deltas de texto
                if (typeof json.delta === "string" && json.delta.length) {
                  setMessages(prev =>
                    prev.map(m => (m.id === asstId ? { ...m, content: m.content + json.delta } : m))
                  );
                }

                // Erro sinalizado pelo servidor
                if (json.error) {
                  throw new Error(json.error);
                }
              } catch {
                // Ignora frames keep-alive/non-JSON
              }
            }
          }
        }
      }

      if (newThreadId && newThreadId !== threadId) {
        setThreadId(newThreadId);
      }
    } catch (err: any) {
      console.error(err);
      // Troca a mensagem vazia da assistente por uma mensagem de erro
      setMessages(prev =>
        prev.map(m =>
          m.id === asstId && m.content === ""
            ? { ...m, content: "Desculpe, ocorreu um erro ao processar sua mensagem." }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[70vh]">
      {/* Topo do chat com avatar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-black/10 bg-white">
        <Image
          src="/assistente-virtual.png"
          width={32}
          height={32}
          alt="Assistente virtual"
          className="rounded-md ring-1 ring-black/10"
             </div>
      </div>

      {/* Lista de mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-white/50">
        {messages.map(m => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {loading && <MessageBubble role="assistant" content="Digitando…" />}
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-3 border-t border-black/10 bg-white">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl bg-gray-50 border border-black/10 px-4 py-3 outline-none placeholder:text-gray-400 focus:border-brand-blue"
            placeholder="Escreva sua mensagem e pressione Enter…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-brand-blue text-white px-5 py-3 font-medium hover:opacity-90 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
