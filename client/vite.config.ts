import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the API runs separately; proxy it so the app can always call "/api".
    proxy: {
      '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://localhost:5000', changeOrigin: true },
    },
  },
})
