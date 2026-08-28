import { loadEnv } from "vite";

const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const errors = [];

function required(name) {
  const current = String(env[name] || "").trim();
  if (!current) errors.push(`${name} is required`);
  return current;
}

function secureUrl(name, requiredValue = true) {
  const current = requiredValue
    ? required(name)
    : String(env[name] || "").trim();
  if (current && !/^https:\/\//i.test(current))
    errors.push(`${name} must use https://`);
  return current;
}

const siteUrl = secureUrl("VITE_SITE_URL");
required("VITE_SUPPORT_EMAIL");
required("VITE_PRIVACY_EMAIL");
required("VITE_GOOGLE_MAPS_BROWSER_API_KEY");

if (siteUrl && /localhost|ngrok-free|example\.(com|org)/i.test(siteUrl)) {
  errors.push(
    "VITE_SITE_URL must be the permanent public domain, not localhost, ngrok, or an example domain",
  );
}

if (env.VITE_STORES_LIVE === "true") {
  secureUrl("VITE_PASSENGER_ANDROID_URL");
  secureUrl("VITE_DRIVER_ANDROID_URL");
}

if (errors.length) {
  console.error("Landing production configuration is incomplete:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Landing production configuration is valid.");
