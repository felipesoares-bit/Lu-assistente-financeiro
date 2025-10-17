import Chat from "@/components/Chat";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4">
      {/* Hero minimalista */}
      <section className="text-center mt-16 mb-10">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
          Lu <span className="text-brand-red">•</span> assistente financeiro
        </h2>
        <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
          Converse no centro da tela. Interface clara em azul e vermelho suaves, com respostas geradas pela OpenAI Assistants API.
        </p>
      </section>

      {/* Chat central */}
      <section className="rounded-2xl border border-black/10 bg-white shadow-glow p-0 overflow-hidden">
        <Chat />
      </section>
    </div>
  );
}
