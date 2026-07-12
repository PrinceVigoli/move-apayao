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

export type PlaceSearchResult = {
  predictions: PlacePrediction[];
  /** True when the server has no Places key configured or the call failed —
   * the UI should tell the user to tap the map instead of showing nothing. */
  unavailable: boolean;
};

/**
 * Text autocomplete via the backend Places proxy. Returns a short pick-list
 * plus an `unavailable` flag so the caller can show "search unavailable — tap
 * the map instead" rather than a silent empty dropdown.
 */
export async function searchPlaces(
  query: string,
  sessionToken: string,
): Promise<PlaceSearchResult> {
  const q = query.trim();
  if (q.length < 2 || !API_BASE_URL) return { predictions: [], unavailable: !API_BASE_URL };
  try {
    const url = new URL(`${base()}/api/places/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('sessiontoken', sessionToken);
    const resp = await fetch(url.toString(), { headers: await authHeaders() });
    if (!resp.ok) return { predictions: [], unavailable: true };
    const data = (await resp.json()) as {
      predictions?: PlacePrediction[];
      unavailable?: boolean;
    };
    return { predictions: data.predictions ?? [], unavailable: !!data.unavailable };
  } catch {
    return { predictions: [], unavailable: true };
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
