import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// A public static site: no auth, no API calls, no env requirements.
// `pnpm build` produces a plain dist/ you can drop on any static host.
// Set BASE_PATH if deploying to a sub-path rather than a domain root.
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
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT ?? 5175),
    host: '0.0.0.0',
    // Permit only ngrok's controlled development hostnames when sharing this
    // Vite server. Avoid `allowedHosts: true`, which enables DNS rebinding.
    allowedHosts: ['postcard-shawl-upstroke.ngrok-free.dev'],
    proxy: {
      // A single ngrok URL can expose the public site, dashboard, and API.
      // Keep the API, database, Redis, Adminer, and GIS ports private.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/dashboard': {
        target: 'http://localhost:5173',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
