import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// GitHub Pages serves this repo from a subpath (/inventory/), so the bundle
// must be built with a matching base. Override with VITE_BASE when deploying
// elsewhere (e.g. '/' for a custom domain).
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/inventory/' : '/'),
  plugins: [react(), tailwindcss()],
  resolve: {
    // import.meta.dirname, not `new URL(...).pathname` -- the latter yields
    // a leading-slash '/C:/...' path on Windows and breaks resolution.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: { port: 5173 },
}))
