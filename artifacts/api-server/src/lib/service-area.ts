const EARTH_RADIUS_KM = 6371.0088;

export interface PilotServiceArea {
  enabled: boolean;
  label: string;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  minimumTripKm: number;
}

function finiteNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
}

export function getPilotServiceArea(
  env: NodeJS.ProcessEnv = process.env,
): PilotServiceArea {
  return {
    // The repository is currently a Pudtol-Luna pilot. Explicitly set false
    // for development data outside Apayao or when a database-managed polygon
    // replaces this radius later.
    enabled: env.PILOT_SERVICE_AREA_ENABLED?.toLowerCase() !== "false",
    label: env.PILOT_SERVICE_AREA_LABEL?.trim() || "Pudtol–Luna pilot area",
    centerLat: boundedNumber(env.PILOT_SERVICE_AREA_CENTER_LAT, 18.283, -90, 90),
    centerLon: boundedNumber(env.PILOT_SERVICE_AREA_CENTER_LON, 121.372, -180, 180),
    radiusKm: boundedNumber(env.PILOT_SERVICE_AREA_RADIUS_KM, 20, 0.5, 100),
    minimumTripKm: boundedNumber(env.PILOT_MIN_TRIP_DISTANCE_KM, 0.2, 0, 10),
  };
}

export function haversineKm(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function validatePilotEndpoints(
  pickup: { lat: number; lon: number },
  dropoff: { lat: number; lon: number },
  area = getPilotServiceArea(),
): { ok: true } | { ok: false; field: "pickup" | "dropoff"; message: string } {
  if (!area.enabled) return { ok: true };
  const center = { lat: area.centerLat, lon: area.centerLon };
  if (haversineKm(center, pickup) > area.radiusKm) {
    return {
      ok: false,
      field: "pickup",
      message: `Pickup must be inside the ${area.label}.`,
    };
  }
  if (haversineKm(center, dropoff) > area.radiusKm) {
    return {
      ok: false,
      field: "dropoff",
      message: `Destination must be inside the ${area.label}.`,
    };
  }
  return { ok: true };
}

export function validatePilotTripDistance(
  distanceKm: number,
  area = getPilotServiceArea(),
): { ok: true } | { ok: false; message: string } {
  if (!area.enabled || distanceKm >= area.minimumTripKm) return { ok: true };
  return {
    ok: false,
    message: `Pickup and destination must be at least ${area.minimumTripKm} km apart.`,
  };
}
