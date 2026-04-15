import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // any requests to /api will be proxied to http://localhost:8000 my fastapi server
    proxy: {
      '/api': {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
  },
})
