import { Linking } from "react-native";

export const LEGAL_VERSION = "2026-08-27";
export const LEGAL_BASE_URL = (
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL ||
  "https://moveapayao.com"
).replace(/\/+$/, "");

export function openLegalDocument(document: "terms" | "privacy") {
  return Linking.openURL(`${LEGAL_BASE_URL}/${document}`);
}

export function openSupportEmail() {
  const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "lgupudtol1@gmail.com";
  return Linking.openURL(
    `mailto:${email}?subject=${encodeURIComponent("MOVE Apayao driver support")}`,
  );
}
