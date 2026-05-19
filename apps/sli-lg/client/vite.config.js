import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ['unintensive-precosmic-latia.ngrok-free.dev'],
    proxy: {
      '/slilg-api': {
        target: 'https://slilg-api.avlokai.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/slilg-api/, ''),
      },
      '/wa-api': {
        target: 'https://wa-slilg.avlokai.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/wa-api/, ''),
      },
    },
  },
})
