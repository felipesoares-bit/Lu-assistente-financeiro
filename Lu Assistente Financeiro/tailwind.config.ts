import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#3B82F6",       // azul claro
          red: "#EF4444",        // vermelho menos saturado
          grayBg: "#F3F4F6",     // cinza claro para o fundo
          blueAccent: "#1E40AF"   // azul mais escuro para contrastes
        }
      },
      boxShadow: {
        glow: "0 0 40px rgba(59, 130, 246, 0.25)"
      }
    },
  },
  plugins: [],
}
export default config
