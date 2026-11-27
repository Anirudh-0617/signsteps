import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev proxy: the browser calls /api/lessons/* and /api/health on the Vite
// server, which forwards them to the FastAPI backend on port 8000. Same origin,
// so no CORS setup is needed, and the Gemini key only ever lives in backend/.env.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
