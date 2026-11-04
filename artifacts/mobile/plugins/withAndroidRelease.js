const {
  withAppBuildGradle,
  withGradleProperties,
  withAndroidManifest,
} = require("expo/config-plugins");

// Generated android/ files are excluded from source control; apply on every prebuild.
module.exports = function withAndroidRelease(config) {
  config = withGradleProperties(config, (mod) => {
    for (const [key, value] of Object.entries({
      "android.enableMinifyInReleaseBuilds": "true",
      "android.enableShrinkResourcesInReleaseBuilds": "true",
      edgeToEdgeEnabled: "true",
    })) {
      mod.modResults = mod.modResults.filter((item) => item.key !== key);
      mod.modResults.push({ type: "property", key, value });
    }
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy")
      throw new Error("Expected Expo Groovy template.");
    if (
      !/getDefaultProguardFile\(["']proguard-android(?:-optimize)?\.txt["']\)/.test(
        mod.modResults.contents,
      )
    ) {
      throw new Error("Cannot locate release optimisation rules.");
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      /getDefaultProguardFile\(["']proguard-android\.txt["']\)/g,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error("Android application missing.");
    application.$["android:resizeableActivity"] = "true";
    const main = application.activity?.find(
      (item) => item.$["android:name"] === ".MainActivity",
    );
    if (!main) throw new Error("MainActivity missing.");
    main.$["android:screenOrientation"] = "unspecified";
    main.$["android:resizeableActivity"] = "true";
    delete main.$["android:minAspectRatio"];
    delete main.$["android:maxAspectRatio"];
    return mod;
  });
};
