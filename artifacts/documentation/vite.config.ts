import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const configuredHosts = (process.env.DOCS_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT ?? 5176),
    host: "0.0.0.0",
    allowedHosts: configuredHosts,
    // Keep local development aligned with the dashboard and landing site:
    // browser requests stay same-origin while Vite forwards only /api calls
    // to the private API server.
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: Number(process.env.PORT ?? 5176),
    host: "0.0.0.0",
    allowedHosts: configuredHosts,
  },
});
