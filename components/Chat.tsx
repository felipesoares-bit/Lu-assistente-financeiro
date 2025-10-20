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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    const asstMsg: Msg = { id: crypto.randomUUID(), role: "assistant", content: "" };
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

      while (!done) {
        const result = await reader.read();
        done = result.done;
        const chunk = decoder.decode(result.value || new Uint8Array(), { stream: !done });
        const parts = chunk.split("\n\n");
        for (const part of parts) {
          const line = part.trim();
          if (!line || !line.startsWith("data:")) continue;
          const dataStr = line.slice(5).trim();
          if (dataStr === "[DONE]") {
            done = true;
            break;
          }
          try {
            const json = JSON.parse(dataStr);
            if (json.threadId && !newThreadId) newThreadId = json.threadId;
            if (typeof json.delta === "string" && json.delta.length) {
              setMessages(prev => prev.map(m => m.id === asstMsg.id ? { ...m, content: m.content + json.delta } : m));
            }
            if (json.error) {
              throw new Error(json.error);
            }
          } catch {}
        }
      }

      if (newThreadId && newThreadId !== threadId) setThreadId(newThreadId);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => prev.map(m => m.role === "assistant" && m.content === "" ? { ...m, content: "Desculpe, ocorreu um erro ao processar sua mensagem." } : m));
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
        />
        <div className="text-sm">
          <div className="font-medium">Lu</div>
          <div className="text-gray-600">Assistente financeiro • OpenAI</div>
        </div>
      </div>

      {/* Lista de mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-white/50">
        {messages.map(m => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {loading && (
          <MessageBubble role="assistant" content="Digitando…" />
        )}
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
