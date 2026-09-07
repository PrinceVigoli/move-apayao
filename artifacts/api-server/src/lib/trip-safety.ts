import { getRedis } from "./redis";
import { getBestDriverLocations } from "./vehicles";

type Coordinate = { lat: number; lon: number };

function boundedNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const radiusM = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function verifyDriverProximity(
  driverId: string,
  target: Coordinate,
  phase: "pickup" | "dropoff",
): Promise<
  | { ok: true; distanceM?: number; source?: "iot_gps" | "smartphone_gps" }
  | { ok: false; code: string; message: string }
> {
  if (process.env.TRIP_PROXIMITY_ENFORCEMENT?.toLowerCase() !== "true") {
    return { ok: true };
  }
  const location = (await getBestDriverLocations([driverId])).get(driverId);
  if (!location) {
    return {
      ok: false,
      code: "DRIVER_LOCATION_REQUIRED",
      message: "A current GPS position is required. Turn on driver location and try again.",
    };
  }
  const maxAgeMs = boundedNumber(process.env.TRIP_LOCATION_MAX_AGE_MS, 180_000, 30_000, 15 * 60_000);
  if (location.capturedAt.getTime() < Date.now() - maxAgeMs) {
    return {
      ok: false,
      code: "DRIVER_LOCATION_STALE",
      message: "Your GPS position is stale. Wait for a location update and try again.",
    };
  }
  const distanceM = haversineMeters({ lat: location.lat, lon: location.lon }, target);
  const allowedM = phase === "pickup"
    ? boundedNumber(process.env.TRIP_PICKUP_RADIUS_M, 750, 100, 5_000)
    : boundedNumber(process.env.TRIP_DROPOFF_RADIUS_M, 1_500, 100, 10_000);
  if (distanceM > allowedM) {
    return {
      ok: false,
      code: phase === "pickup" ? "TOO_FAR_FROM_PICKUP" : "TOO_FAR_FROM_DROPOFF",
      message: `You are about ${Math.round(distanceM)} m from the ${phase} point. Move closer and try again.`,
    };
  }
  return { ok: true, distanceM, source: location.source };
}

const localPinFailures = new Map<string, { count: number; expiresAt: number }>();
const PIN_WINDOW_SECONDS = 15 * 60;

function pinKey(tripId: number, driverId: string): string {
  return `trip-pin-failures:${tripId}:${driverId}`;
}

export async function getPickupPinFailures(tripId: number, driverId: string): Promise<number> {
  const key = pinKey(tripId, driverId);
  if (process.env.REDIS_URL) {
    try {
      return Number((await getRedis().get(key)) ?? 0);
    } catch {
      // Use the local process fallback until Redis recovers.
    }
  }
  const row = localPinFailures.get(key);
  if (!row || row.expiresAt <= Date.now()) {
    localPinFailures.delete(key);
    return 0;
  }
  return row.count;
}

export async function recordPickupPinFailure(tripId: number, driverId: string): Promise<number> {
  const key = pinKey(tripId, driverId);
  if (process.env.REDIS_URL) {
    try {
      const count = await getRedis().incr(key);
      if (count === 1) await getRedis().expire(key, PIN_WINDOW_SECONDS);
      return count;
    } catch {
      // Use the local process fallback until Redis recovers.
    }
  }
  const previous = localPinFailures.get(key);
  const count = previous && previous.expiresAt > Date.now() ? previous.count + 1 : 1;
  localPinFailures.set(key, { count, expiresAt: Date.now() + PIN_WINDOW_SECONDS * 1000 });
  return count;
}

export async function clearPickupPinFailures(tripId: number, driverId: string): Promise<void> {
  const key = pinKey(tripId, driverId);
  localPinFailures.delete(key);
  if (process.env.REDIS_URL) {
    await getRedis().del(key).catch(() => undefined);
  }
}
