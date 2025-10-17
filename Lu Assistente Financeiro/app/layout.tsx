import type { Metadata } from "next";
import "./globals.css";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Lu • assistente financeiro",
  description: "Assistente virtual financeira personalizada com OpenAI Assistants API",
  icons: [{ rel: "icon", url: "/logo.png" }],
  openGraph: {
    title: "Lu • assistente financeiro",
    description: "Front minimalista com chat e Assistants API",
    images: ["/assistente-virtual.png"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b border-black/5">
          <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="rounded-md" />
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-gray-900">Lu</span>{" "}
              <span className="text-brand-red">• assistente financeiro</span>
            </h1>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-10 pb-8 text-center text-xs text-gray-500">
          Construído com Next.js • Hospedado na Vercel • Assistants API v2 (stream)
        </footer>
      </body>
    </html>
  );
}
