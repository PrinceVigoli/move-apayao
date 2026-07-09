import { supabase } from '@/lib/supabase';
import { API_BASE_URL } from '@/lib/api-config';

export type PlacePrediction = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type PlaceDetails = {
  lat: number;
  lon: number;
  address: string;
};

// A per-search session token links autocomplete calls with the final details
// call so Google bills them as one cheaper session. Generate one when the user
// starts typing a field, reuse it through their selection, then discard.
export function newPlacesSessionToken(): string {
  // Lightweight UUID-ish token; doesn't need to be cryptographically strong.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function base(): string {
  return API_BASE_URL.replace(/\/+$/, '');
}

/**
 * Text autocomplete via the backend Places proxy. Returns a short pick-list.
 * On any failure (no key configured, network, Places API disabled) it resolves
 * to an empty list so the caller cleanly falls back to "tap the map instead".
 */
export async function searchPlaces(
  query: string,
  sessionToken: string,
): Promise<PlacePrediction[]> {
  const q = query.trim();
  if (q.length < 2 || !API_BASE_URL) return [];
  try {
    const url = new URL(`${base()}/api/places/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('sessiontoken', sessionToken);
    const resp = await fetch(url.toString(), { headers: await authHeaders() });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { predictions?: PlacePrediction[] };
    return data.predictions ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolves a chosen prediction to coordinates + a clean address label. Returns
 * null on failure so the caller can ask the user to tap the map instead.
 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  if (!API_BASE_URL) return null;
  try {
    const url = new URL(`${base()}/api/places/details`);
    url.searchParams.set('placeId', placeId);
    url.searchParams.set('sessiontoken', sessionToken);
    const resp = await fetch(url.toString(), { headers: await authHeaders() });
    if (!resp.ok) return null;
    return (await resp.json()) as PlaceDetails;
  } catch {
    return null;
  }
}
