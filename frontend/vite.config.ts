import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:61008',
        changeOrigin: true,
      },
      '/generate_runid': { target: 'http://localhost:61008', changeOrigin: true },
      '/update_runid': { target: 'http://localhost:61008', changeOrigin: true },
      '/updatelatestpatch': { target: 'http://localhost:61008', changeOrigin: true },
      '/patch_task': { target: 'http://localhost:61008', changeOrigin: true },
      '/updateaction': { target: 'http://localhost:61008', changeOrigin: true },
      '/updateremarks': { target: 'http://localhost:61008', changeOrigin: true },
      '/updateonboard': { target: 'http://localhost:61008', changeOrigin: true },
      '/updatepackages': { target: 'http://localhost:61008', changeOrigin: true },
    },
  },
})
