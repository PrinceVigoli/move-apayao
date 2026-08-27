import { useEffect, useState } from "react";

export interface PublicLoopRoute {
  id: number;
  name: string;
  description: string | null;
  baseFare: number;
  distanceKm: number | null;
  routeDurationSeconds: number | null;
  routePolyline: string | null;
  distanceSource: "google_routes" | "haversine_fallback" | null;
}

export interface PublicLoopStop {
  id: number;
  name: string;
  sequence: number;
  lat: number;
  lon: number;
}

export interface FeaturedLoop {
  route: PublicLoopRoute;
  stops: PublicLoopStop[];
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
let featuredLoopPromise: Promise<FeaturedLoop | null> | null = null;

async function loadFeaturedLoop(): Promise<FeaturedLoop | null> {
  const listResponse = await fetch(`${API_BASE}/api/loops`);
  if (!listResponse.ok)
    throw new Error(`Loop list failed (${listResponse.status})`);
  const list = (await listResponse.json()) as { routes?: PublicLoopRoute[] };
  const first = list.routes?.[0];
  if (!first) return null;

  // Published loops store their road geometry. Do not recompute Google Routes
  // on every public page load; this keeps the landing page to one map load.
  const detailResponse = await fetch(`${API_BASE}/api/loops/${first.id}`);
  if (!detailResponse.ok)
    throw new Error(`Loop detail failed (${detailResponse.status})`);
  return (await detailResponse.json()) as FeaturedLoop;
}

export function useFeaturedLoop() {
  const [data, setData] = useState<FeaturedLoop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    featuredLoopPromise ??= loadFeaturedLoop();
    featuredLoopPromise
      .then((loop) => {
        if (!cancelled) setData(loop);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason : new Error("Loop unavailable"),
          );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, isLoading, error };
}

export function decodeGooglePolyline(
  encoded: string,
): Array<{ lat: number; lng: number }> {
  const path: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    path.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
  }

  return path;
}
