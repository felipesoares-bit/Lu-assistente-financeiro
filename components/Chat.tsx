"use client";
import { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
interface Msg { id: string; role: Role; content: string }

export default function Chat() {
  const [messages] = useState<Msg[]>([
    { id: "init", role: "assistant", content: "Olá! Eu sou a Lu. Tudo certo!" }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div ref={scrollRef} className="h-[70vh] p-6 bg-white rounded-2xl border border-black/10">
      <div className="font-semibold mb-2">Chat de teste</div>
      <div className="text-sm text-gray-700">Se você está lendo isto em produção, o build passou ✅</div>
    </div>
  );
}
