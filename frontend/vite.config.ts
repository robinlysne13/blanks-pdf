import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the backend runs on 8765 and Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
})
