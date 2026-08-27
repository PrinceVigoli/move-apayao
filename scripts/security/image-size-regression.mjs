import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const store = join(process.cwd(), "node_modules", ".pnpm");
const entry = readdirSync(store).find((name) =>
  name.startsWith("image-size@1.2.1_"),
);
if (!entry)
  throw new Error("Patched image-size@1.2.1 installation was not found");

const packageDir = join(store, entry, "node_modules", "image-size");
if (!entry.includes("patch_hash_")) {
  throw new Error(
    "image-size@1.2.1 is installed without the required pnpm security patch",
  );
}

const probe = `
const { imageSize } = require(${JSON.stringify(packageDir)});
const { findBox } = require(${JSON.stringify(join(packageDir, "dist", "types", "utils.js"))});

const icns = Buffer.alloc(16);
icns.write("icns", 0, "ascii");
icns.writeUInt32BE(16, 4);
icns.write("ic07", 8, "ascii");
icns.writeUInt32BE(0, 12);
let rejected = false;
try { imageSize(icns); } catch (error) { rejected = /Invalid ICNS entry length/.test(String(error)); }
if (!rejected) throw new Error("Malformed ICNS was not rejected by the patched parser");

const zeroBox = Buffer.alloc(16);
zeroBox.writeUInt32BE(0, 0);
zeroBox.write("free", 4, "ascii");
if (findBox(zeroBox, "jxlp", 0) !== undefined) throw new Error("Malformed ISO box was accepted");
`;

const result = spawnSync(process.execPath, ["-e", probe], {
  encoding: "utf8",
  timeout: 2_000,
});

if (result.error?.code === "ETIMEDOUT") {
  throw new Error(
    "Malformed image probe timed out; the denial-of-service regression is present",
  );
}
if (result.status !== 0) {
  throw new Error(
    `Image parser security regression failed:\n${result.stderr || result.stdout}`,
  );
}

console.log(
  "Patched image-size parsers reject non-progressing ICNS and ISO box inputs.",
);
