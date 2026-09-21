import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// On GitHub Pages the site lives at /inventory/, so production builds use that
// as the base path. VITE_BASE can override it.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/inventory/' : '/'),
  plugins: [react()],
  server: { port: 5173 },
}))
