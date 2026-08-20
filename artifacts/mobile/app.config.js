const base = require("./app.json").expo;

module.exports = () => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY;

  if (
    process.env.EAS_BUILD === "true" &&
    process.env.EAS_BUILD_PLATFORM === "android" &&
    !androidKey
  ) {
    throw new Error(
      "GOOGLE_MAPS_ANDROID_API_KEY is required for an Android EAS build. " +
        "Add it to the EAS environment selected by this build profile.",
    );
  }

  return {
    ...base,
    ios: {
      ...base.ios,
      ...(iosKey ? { config: { googleMapsApiKey: iosKey } } : {}),
    },
    android: {
      ...base.android,
      ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
    },
  };
};
