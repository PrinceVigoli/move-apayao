import { logger } from "./logger";
import { getRedis } from "./redis";

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const REDIS_CACHE_TTL_SECONDS = 10 * 60;

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface DrivingRoute {
  distanceKm: number;
  durationSeconds: number | null;
  encodedPolyline: string | null;
  source: "google_routes" | "haversine_fallback";
}

interface CachedRoute {
  expiresAt: number;
  route: DrivingRoute;
}

const routeCache = new Map<string, CachedRoute>();

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function computeStraightLineRoute(points: RoutePoint[]): DrivingRoute {
  if (points.length < 2) {
    throw new Error("At least two route points are required");
  }
  let distanceKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    distanceKm += haversineKm(points[index - 1]!, points[index]!);
  }
  return {
    distanceKm,
    durationSeconds: null,
    encodedPolyline: null,
    source: "haversine_fallback",
  };
}

function cacheKey(points: RoutePoint[]): string {
  return points.map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`).join("|");
}

function waypoint(point: RoutePoint) {
  return {
    location: {
      latLng: { latitude: point.lat, longitude: point.lon },
    },
  };
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !value.endsWith("s")) return null;
  const seconds = Number(value.slice(0, -1));
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

/**
 * Returns a road-following route from Google Routes when configured. A
 * straight-line result is returned only as an explicit, labelled diagnostic
 * fallback. Fare, booking, and route-publishing endpoints reject that source
 * so a provider outage can never silently produce a bill from air distance.
 */
export async function computeDrivingRoute(points: RoutePoint[]): Promise<DrivingRoute> {
  if (points.length < 2) {
    throw new Error("At least two route points are required");
  }

  const fallback = computeStraightLineRoute(points);
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    logger.warn("Google Routes key is not configured; using straight-line distance fallback");
    return fallback;
  }

  const key = cacheKey(points);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.route;

  const redisKey = `google:route:${key}`;
  try {
    const sharedCached = await getRedis().get(redisKey);
    if (sharedCached) {
      const route = JSON.parse(sharedCached) as DrivingRoute;
      if (
        Number.isFinite(route.distanceKm) &&
        (route.durationSeconds === null || Number.isFinite(route.durationSeconds)) &&
        (route.encodedPolyline === null || typeof route.encodedPolyline === "string")
      ) {
        routeCache.set(key, { route, expiresAt: Date.now() + CACHE_TTL_MS });
        return route;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Redis route cache read failed");
  }

  try {
    const response = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: waypoint(points[0]!),
        destination: waypoint(points[points.length - 1]!),
        intermediates: points.slice(1, -1).map(waypoint),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        computeAlternativeRoutes: false,
        polylineQuality: "OVERVIEW",
        polylineEncoding: "ENCODED_POLYLINE",
        languageCode: "en-PH",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.warn(
        { status: response.status, detail: detail.slice(0, 300) },
        "Google Routes request failed; using fallback",
      );
      return fallback;
    }

    const data = (await response.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }>;
    };
    const first = data.routes?.[0];
    if (!first || !Number.isFinite(first.distanceMeters) || first.distanceMeters! <= 0) {
      logger.warn("Google Routes returned no usable route; using fallback");
      return fallback;
    }

    const route: DrivingRoute = {
      distanceKm: first.distanceMeters! / 1000,
      durationSeconds: parseDurationSeconds(first.duration),
      encodedPolyline: first.polyline?.encodedPolyline ?? null,
      source: "google_routes",
    };

    if (routeCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = routeCache.keys().next().value as string | undefined;
      if (oldestKey) routeCache.delete(oldestKey);
    }
    routeCache.set(key, { route, expiresAt: Date.now() + CACHE_TTL_MS });
    try {
      await getRedis().set(redisKey, JSON.stringify(route), "EX", REDIS_CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn({ err }, "Redis route cache write failed");
    }
    return route;
  } catch (err) {
    logger.warn({ err }, "Google Routes request errored; using fallback");
    return fallback;
  }
}
