import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const source = path.resolve(appDir, "../../lib/api-spec/openapi.yaml");
const outputDir = path.resolve(appDir, "src/generated");
const output = path.resolve(outputDir, "openapi.json");

const yaml = await readFile(source, "utf8");
const spec = parse(yaml);

if (!spec?.openapi || !spec?.paths || !spec?.info) {
  throw new Error("The MOVE Apayao OpenAPI source is incomplete.");
}

await mkdir(outputDir, { recursive: true });
await writeFile(output, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

console.log(`Generated ${Object.keys(spec.paths).length} documented API paths.`);
