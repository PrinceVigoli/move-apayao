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
  },
});
