import Image from "next/image";

export default function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string; }) {
  const isUser = role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <Image
          src="/assistente-virtual.png"
          alt="Assistente"
          width={28}
          height={28}
          className="rounded-md mt-1 ring-1 ring-black/10"
        />
      )}
      <div
        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-brand-red text-white rounded-tr-sm"
            : "bg-gray-50 text-gray-900 border border-black/10 rounded-tl-sm"
        }`}
      >
        {content}
      </div>
      {isUser && (
        <div className="w-7 h-7 mt-1 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 border border-black/10">
          Você
        </div>
      )}
    </div>
  );
}
