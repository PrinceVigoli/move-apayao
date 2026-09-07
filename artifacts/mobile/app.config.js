const base = require("./app.json").expo;

module.exports = () => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const releaseBuild =
    process.env.EAS_BUILD === "true" &&
    ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE ?? "");

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

  if (releaseBuild) {
    let parsed;
    try {
      parsed = new URL(apiUrl);
    } catch {
      throw new Error("EXPO_PUBLIC_API_URL must be a valid HTTPS URL for preview/production builds.");
    }
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".ngrok-free.app") ||
      host.endsWith(".ngrok-free.dev")
    ) {
      throw new Error(
        "EXPO_PUBLIC_API_URL must use the permanent HTTPS API hostname for preview/production builds.",
      );
    }
  }

  return {
    ...base,
    ios: {
      ...base.ios,
      ...(iosKey ? { config: { googleMapsApiKey: iosKey } } : {}),
    },
    android: {
      ...base.android,
      googleServicesFile,
      ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
    },
  };
};
