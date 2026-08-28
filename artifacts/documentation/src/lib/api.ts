const configuredApiUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");

export const apiOrigin = configuredApiUrl.replace(/\/api$/i, "");

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiOrigin}/api${normalized}`;
}

export async function readApiJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(
      response.ok
        ? "The API returned an empty response."
        : "The API is unavailable. Confirm that the local API server is running.",
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(
      "The API returned an invalid response. Confirm the documentation API URL and local proxy configuration.",
    );
  }
}

export function publicApiLabel(): string {
  return apiOrigin || window.location.origin;
}
