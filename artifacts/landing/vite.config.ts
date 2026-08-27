import path from "path";
import fs from "node:fs/promises";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

// `pnpm build` produces a static dist/; the map reads the configured public API.
// `build:production` validates public metadata and contact configuration first.
function publicMetadata(siteUrl: string): Plugin {
  const replace = (contents: string) =>
    contents.replaceAll("__SITE_URL__", siteUrl);
  return {
    name: "move-public-metadata",
    transformIndexHtml: replace,
    async closeBundle() {
      const dist = path.resolve(import.meta.dirname, "dist");
      for (const name of ["robots.txt", "sitemap.xml"]) {
        const file = path.join(dist, name);
        await fs.writeFile(
          file,
          replace(await fs.readFile(file, "utf8")),
          "utf8",
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const siteUrl = (env.VITE_SITE_URL || "http://localhost:5175").replace(
    /\/+$/,
    "",
  );

  return {
    base: env.BASE_PATH ?? "/",
    plugins: [react(), tailwindcss(), publicMetadata(siteUrl)],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port: Number(env.PORT ?? 5175),
      host: "0.0.0.0",
      // Permit only ngrok's controlled development hostnames when sharing this
      // Vite server. Avoid `allowedHosts: true`, which enables DNS rebinding.
      allowedHosts: ["postcard-shawl-upstroke.ngrok-free.dev"],
      proxy: {
        // A single ngrok URL can expose the public site, dashboard, and API.
        // Keep the API, database, Redis, Adminer, and GIS ports private.
        "/api": {
          target: "http://localhost:5000",
          changeOrigin: true,
        },
        "/dashboard": {
          target: "http://localhost:5173",
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
