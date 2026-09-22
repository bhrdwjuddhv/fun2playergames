import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const BACKEND_URL = 'http://localhost:3000'

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
    // The browser only talks to Vite. Vite forwards socket/API traffic to the
    // backend, so the frontend never needs to know the backend's address,
    // and there are no CORS problems.
    proxy: {
      '/socket.io': { target: BACKEND_URL, ws: true },
      '/api': BACKEND_URL,
    },
  },
})
