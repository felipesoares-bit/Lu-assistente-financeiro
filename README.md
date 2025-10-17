# Lu • assistente financeiro (Next.js + Assistants API v2 + Streaming)

Front minimalista com chat central, paleta clara (azul/vermelho suave), integrando a **OpenAI Assistants API** com **streaming**. Pronto para deploy na **Vercel**.

## ✨ Recursos
- UI minimalista clara (fundo cinza #F3F4F6, azul #3B82F6, vermelho #EF4444)
- Chat central com avatar da assistente
- Streaming de respostas via SSE
- Assistants API v2 com `assistant_id` (threads/runs)
- Server-side seguro (Edge Runtime)

## 🚀 Rodando localmente
```bash
npm install
cp .env.example .env.local # edite com sua OPENAI_API_KEY e ASSISTANT_ID
npm run dev
# http://localhost:3000
```

Coloque as imagens em `public/`:
```
public/logo.png
public/assistente-virtual.png
```

## ☁️ Deploy na Vercel
1. Faça fork ou suba este repo no seu GitHub.
2. Na Vercel → Import Project → selecione o repositório.
3. Configure as Variáveis de Ambiente:
   - `OPENAI_API_KEY`
   - `ASSISTANT_ID`
4. Deploy.

## 🔧 Notas técnicas
- Endpoint de streaming: `POST /api/chat/stream` (SSE). O cliente lê `data:` com `{ delta, threadId }`.
- A API cria um **Thread** na primeira mensagem e reaproveita o `threadId` nas próximas.
- Runtime Edge para baixa latência.

## 🧩 Personalização
- Cores: `tailwind.config.ts`
- Título: `app/layout.tsx`
- Mensagem de boas-vindas: `components/Chat.tsx`

## ⚠️ Dicas
- Não exponha sua API Key no cliente.
- Se o streaming não chegar, verifique se a Vercel não está usando CDN para a rota de API (Edge funciona com SSE por padrão) e os logs do projeto.
