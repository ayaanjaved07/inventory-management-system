import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// On GitHub Pages the site lives at /inventory/, so production builds use that
// as the base path. VITE_BASE can override it.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/inventory/' : '/'),
  plugins: [react(), tailwindcss()],
  resolve: {
    // Lets imports use '@/...' to mean 'src/...'.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: { port: 5173 },
}))
