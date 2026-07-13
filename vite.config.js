import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    restoreMocks: true,
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    strictPort: false,
  },
})
