import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

// Resolve the parser actually consumed by each Expo CLI. pnpm can shorten
// store folder names, and old installs can leave unrelated copies behind.
const packageDirs = new Set();
for (const app of ["mobile", "driver"]) {
  const expoRequire = createRequire(
    realpathSync(
      join(
        process.cwd(),
        "artifacts",
        app,
        "node_modules",
        "expo",
        "package.json",
      ),
    ),
  );
  const cliRequire = createRequire(
    expoRequire.resolve("@expo/cli/package.json"),
  );
  const imageUtilsRequire = createRequire(
    cliRequire.resolve("@expo/image-utils/package.json"),
  );
  packageDirs.add(
    dirname(imageUtilsRequire.resolve("image-size/package.json")),
  );
}

for (const packageDir of packageDirs) {
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
}

console.log(
  "Patched image-size parsers reject non-progressing ICNS and ISO box inputs.",
);
