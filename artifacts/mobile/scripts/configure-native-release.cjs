const fs = require("node:fs");
const path = require("node:path");

// EAS invokes this hook in its disposable build workspace, after prebuild and
// before Gradle. Package-level exclusion avoids SDK 54's multi-value Gradle
// exclude argument handling, and removes the development client's whole graph.
if (
  process.env.EAS_BUILD_PLATFORM === "android" &&
  ["production", "pilot", "preview"].includes(process.env.EAS_BUILD_PROFILE)
) {
  const file = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.expo ??= {};
  pkg.expo.autolinking ??= {};
  pkg.expo.autolinking.android ??= {};
  pkg.expo.autolinking.android.exclude = [
    ...new Set([
      ...(pkg.expo.autolinking.android.exclude ?? []),
      "expo-dev-client",
      "expo-dev-launcher",
      "expo-dev-menu",
      "expo-dev-menu-interface",
    ]),
  ];
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(
    "Android release autolinking excludes development client modules.",
  );
}
