import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build } from "esbuild";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(artifactDir, "dist");
await rm(distDir, { recursive: true, force: true });

await build({
  entryPoints: [path.resolve(artifactDir, "src/index.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: distDir,
  outExtension: { ".js": ".mjs" },
  sourcemap: "linked",
  external: ["pg-native"],
  banner: {
    js: `import { createRequire as __gisCreateRequire } from "node:module";
globalThis.require = __gisCreateRequire(import.meta.url);`,
  },
  logLevel: "info"
});
