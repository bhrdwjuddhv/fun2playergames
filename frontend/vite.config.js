import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The Worker, started with: cd backend && npm run dev
const WORKER_URL = 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  server: {
    // host: true = also reachable from your phone on the same Wi-Fi
    // (Vite prints a "Network:" address — open that on the phone).
    host: true,
    // The browser only talks to Vite. Vite forwards the WebSocket and API
    // traffic to the Worker, so the frontend never needs to know the
    // Worker's address, and there are no CORS problems.
    proxy: {
      '/ws': { target: WORKER_URL, ws: true },
      '/api': WORKER_URL,
    },
  },
})
