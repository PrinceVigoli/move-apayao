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
  },
  preview: {
    port: Number(process.env.PORT ?? 5176),
    host: "0.0.0.0",
    allowedHosts: configuredHosts,
  },
});
