/**
 * Single source of truth for the API base URL on the mobile app.
 *
 * The generated api-client is configured via setBaseUrl() in _layout.tsx, but
 * features that don't go through the generated fetch client (e.g. the SSE
 * live-tracking stream, which uses EventSource) need the same base URL. Import
 * API_BASE_URL from here so both paths stay in sync.
 *
 * - Local dev: set EXPO_PUBLIC_API_URL, e.g. http://192.168.1.23:5000
 * - Replit tunnel: falls back to EXPO_PUBLIC_DOMAIN
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : '');