import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://134.209.72.93:7777',
        ws: true,
        changeOrigin: true,
      },
      '/public': {
        target: 'http://134.209.72.93:7777',
        changeOrigin: true,
      },
      '/api-proxy': {
        target: 'http://134.209.72.93:7777',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api-proxy/, ''),
      },
    },
  },
});
