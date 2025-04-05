import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      external: ['electron'],
    }
  },
  optimizeDeps: {
    exclude: ['electron']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
