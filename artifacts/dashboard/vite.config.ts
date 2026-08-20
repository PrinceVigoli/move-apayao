import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// PORT and BASE_PATH are both optional.
// Set BASE_PATH when the dashboard is served from a sub-path rather than a
// domain root, e.g. BASE_PATH=/admin/ pnpm --filter @workspace/dashboard build
const port = Number(process.env.PORT ?? 5173);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: false,
    host: '0.0.0.0',
    allowedHosts: ['postcard-shawl-upstroke.ngrok-free.dev'],
    fs: {
      strict: true,
    },
    // Proxies API calls to the local api-server during development.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
  },
});
