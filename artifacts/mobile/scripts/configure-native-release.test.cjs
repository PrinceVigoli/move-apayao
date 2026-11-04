const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
test("native release hook preserves dependencies, existing exclusions and development/iOS builds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moveapayao-native-hook-"));
  const file = path.join(dir, "package.json");
  const original = {
    name: "test-app",
    dependencies: {
      "expo-dev-client": "6.0.21",
      "expo-image-picker": "17.0.11",
    },
    expo: { autolinking: { android: { exclude: ["unused-example"] } } },
  };
  const run = (platform, profile) =>
    execFileSync(
      process.execPath,
      [path.join(__dirname, "configure-native-release.cjs")],
      {
        cwd: dir,
        windowsHide: true,
        env: {
          ...process.env,
          EAS_BUILD_PLATFORM: platform,
          EAS_BUILD_PROFILE: profile,
        },
      },
    );
  try {
    fs.writeFileSync(file, JSON.stringify(original));
    run("android", "development");
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), original);
    run("ios", "production");
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), original);
    for (const profile of ["production", "pilot", "preview"]) {
      run("android", profile);
      const pkg = JSON.parse(fs.readFileSync(file));
      assert.deepEqual(pkg.dependencies, original.dependencies);
      const excluded = pkg.expo.autolinking.android.exclude;
      for (const name of [
        "unused-example",
        "expo-dev-client",
        "expo-dev-launcher",
        "expo-dev-menu",
        "expo-dev-menu-interface",
      ])
        assert.ok(excluded.includes(name));
      assert.ok(!excluded.includes("expo-image-picker"));
      assert.equal(excluded.length, 5);
    }
  } finally {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("moveapayao-native-hook-"));
    fs.rmSync(dir, { recursive: true });
  }
});
