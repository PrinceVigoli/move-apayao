import { Linking } from "react-native";

export const LEGAL_VERSION = "2026-10-30";
export const LEGAL_BASE_URL = (
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL ||
  "https://moveapayao.com"
).replace(/\/+$/, "");

export function openLegalDocument(document: "terms" | "privacy" | "delete-account") {
  return Linking.openURL(`${LEGAL_BASE_URL}/${document}`);
}

export function openSupportEmail() {
  const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@moveapayao.com";
  return Linking.openURL(
    `mailto:${email}?subject=${encodeURIComponent("MOVE Apayao app support")}`,
  );
}
