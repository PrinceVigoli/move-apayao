import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

let _redis: Redis | null = null;
let _redisPub: Redis | null = null;
let _redisSub: Redis | null = null;

function createClient(): Redis {
  if (!REDIS_URL) {
    logger.warn("REDIS_URL not set — Redis features will be unavailable");
    // Return a no-op proxy so the app starts without Redis configured
    return new Proxy({} as Redis, {
      get: () => async () => null,
    });
  }
  const client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
  client.on("error", (err) => logger.error({ err }, "Redis error"));
  client.on("connect", () => logger.info("Redis connected"));
  return client;
}

export function getRedis(): Redis {
  if (!_redis) _redis = createClient();
  return _redis;
}

// Separate clients for pub/sub (they can't do other commands while subscribed)
export function getRedisPub(): Redis {
  if (!_redisPub) _redisPub = createClient();
  return _redisPub;
}

export function getRedisSub(): Redis {
  if (!_redisSub) _redisSub = createClient();
  return _redisSub;
}

// Redis Geo key for live driver positions
export const DRIVER_GEO_KEY = "driver:geo";
// Redis Geo key for loop vehicles
export const LOOP_GEO_KEY = "loop_vehicle:geo";

// Publish driver location update to a channel
export async function publishDriverLocation(
  driverId: string,
  lat: number,
  lon: number,
): Promise<void> {
  const pub = getRedisPub();
  await pub.publish(
    `driver:location:${driverId}`,
    JSON.stringify({ driverId, lat, lon, ts: Date.now() }),
  );
}

// Update driver position in Redis Geo index
export async function updateDriverGeo(driverId: string, lat: number, lon: number): Promise<void> {
  const redis = getRedis();
  await redis.geoadd(DRIVER_GEO_KEY, lon, lat, driverId);
}

// Find nearest available drivers within radiusKm
export async function findNearestDrivers(
  lat: number,
  lon: number,
  radiusKm = 5,
  count = 10,
): Promise<Array<{ driverId: string; distanceKm: number }>> {
  const redis = getRedis();
  const results = await redis.georadius(
    DRIVER_GEO_KEY,
    lon,
    lat,
    radiusKm,
    "km",
    "ASC",
    "COUNT",
    count,
    "WITHCOORD",
    "WITHDIST",
  );
  if (!results || !Array.isArray(results)) return [];

  return (results as Array<[string, string, [string, string]]>).map(
    ([driverId, distStr]) => ({
      driverId,
      distanceKm: parseFloat(distStr),
    }),
  );
}

// Remove driver from Geo index (when going offline)
export async function removeDriverGeo(driverId: string): Promise<void> {
  const redis = getRedis();
  await redis.zrem(DRIVER_GEO_KEY, driverId);
}

// Publish trip status update
export async function publishTripUpdate(tripId: number, payload: object): Promise<void> {
  const pub = getRedisPub();
  await pub.publish(`trip:updates:${tripId}`, JSON.stringify(payload));
}
