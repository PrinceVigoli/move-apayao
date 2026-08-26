const configuredApiUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");

export const apiOrigin = configuredApiUrl.replace(/\/api$/i, "");

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiOrigin}/api${normalized}`;
}

export function publicApiLabel(): string {
  return apiOrigin || window.location.origin;
}
