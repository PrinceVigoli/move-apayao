import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit runs as its own process and does NOT inherit the API server's
 * `--env-file` handling, so it has to read the env file itself. Without this,
 * `pnpm --filter @workspace/db run push` fails with "DATABASE_URL, ensure the
 * database is provisioned" unless the variable happens to already be exported
 * in the caller's shell.
 *
 * That used to mean running load-env.ps1 first, which fails outright on
 * Windows machines whose PowerShell execution policy blocks unsigned scripts
 * — a confusing failure for something that has nothing to do with the
 * database. Parsing the file here removes the whole problem on every OS.
 */
function findEnvFile(): string | null {
  // drizzle-kit bundles this config before executing it, and in that bundle
  // `import.meta.dirname` is undefined — so resolve from the working
  // directory instead and walk upward. drizzle-kit runs with cwd = lib/db,
  // but walking up means this keeps working if it is ever invoked from the
  // repo root or another package.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    for (const rel of [
      path.join("artifacts", "api-server", ".env.local"),
      path.join("artifacts", "api-server", ".env"),
    ]) {
      const candidate = path.join(dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadEnvFile(): void {
  if (process.env.DATABASE_URL) return; // a real environment variable always wins

  const file = findEnvFile();
  if (!file) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes, which are common in .env files.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
      "Add it to artifacts/api-server/.env.local, for example:\n" +
      "  DATABASE_URL=postgres://postgres:postgres@localhost:5432/move_apayao",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // PostGIS owns spatial_ref_sys and related extension objects. Excluding
  // those from schema diffing prevents drizzle-kit from mistaking them for
  // application tables that should be renamed or managed by this project.
  extensionsFilters: ["postgis"],
});
