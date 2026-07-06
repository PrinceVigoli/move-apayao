import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { driverProfilesTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import {
  updateDriverGeo,
  removeDriverGeo,
  findNearestDrivers,
  publishDriverLocation,
} from "../lib/redis";
import { markDriverAvailable, markDriverUnavailable } from "../lib/driver-availability";
import { logger } from "../lib/logger";
import { z } from "zod";

const router: IRouter = Router();

// Safe wrappers — Redis failures must not crash driver operations
async function safeUpdateDriverGeo(driverId: string, lat: number, lon: number): Promise<void> {
  try {
    await updateDriverGeo(driverId, lat, lon);
  } catch (err) {
    logger.warn({ err, driverId }, "Redis geo update failed (non-fatal)");
  }
}

async function safePublishDriverLocation(
  driverId: string,
  lat: number,
  lon: number,
): Promise<void> {
  try {
    await publishDriverLocation(driverId, lat, lon);
  } catch (err) {
    logger.warn({ err, driverId }, "Redis location publish failed (non-fatal)");
  }
}

async function safeRemoveDriverGeo(driverId: string): Promise<void> {
  try {
    await removeDriverGeo(driverId);
  } catch (err) {
    logger.warn({ err, driverId }, "Redis geo remove failed (non-fatal)");
  }
}

async function safeFindNearestDrivers(
  lat: number,
  lon: number,
  radiusKm: number,
  count: number,
) {
  try {
    return await findNearestDrivers(lat, lon, radiusKm, count);
  } catch (err) {
    logger.warn({ err }, "Redis geo query failed (non-fatal)");
    return [];
  }
}

const UpdateLocationBody = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/**
 * PUT /api/drivers/location
 * Driver pushes their current GPS coordinates.
 */
router.put(
  "/drivers/location",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = UpdateLocationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { lat, lon } = parsed.data;
    const driverId = authReq.user.id;

    const [profile] = await db
      .update(driverProfilesTable)
      .set({ currentLat: lat, currentLon: lon, lastLocationAt: new Date(), updatedAt: new Date() })
      .where(eq(driverProfilesTable.userId, driverId))
      .returning({ isAvailable: driverProfilesTable.isAvailable });

    // Location pings keep flowing while a driver is mid-trip (that's what
    // feeds the passenger's live tracking map) — but this geo index is what
    // NEW-trip matching reads from. Only an available driver should be
    // discoverable there; a busy driver's ping must not re-add them (and
    // actively removes them if they're somehow still present), otherwise
    // they'd be matchable to a second trip while already driving one.
    const geoUpdate = profile?.isAvailable
      ? safeUpdateDriverGeo(driverId, lat, lon)
      : safeRemoveDriverGeo(driverId);

    await Promise.all([geoUpdate, safePublishDriverLocation(driverId, lat, lon)]);

    res.json({ ok: true });
  },
);

/**
 * GET /api/drivers/nearby?lat=&lon=&radius=5
 */
router.get("/drivers/nearby", requireAuth, async (req, res): Promise<void> => {
  const lat = parseFloat(String(req.query.lat));
  const lon = parseFloat(String(req.query.lon));
  const radiusKm = parseFloat(String(req.query.radius ?? "5"));

  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: "lat and lon are required" });
    return;
  }

  const nearby = await safeFindNearestDrivers(lat, lon, radiusKm, 20);

  if (nearby.length === 0) {
    const profiles = await db
      .select({
        userId: driverProfilesTable.userId,
        vehicleType: driverProfilesTable.vehicleType,
        vehicleColor: driverProfilesTable.vehicleColor,
        plateNumber: driverProfilesTable.plateNumber,
        isAvailable: driverProfilesTable.isAvailable,
        currentLat: driverProfilesTable.currentLat,
        currentLon: driverProfilesTable.currentLon,
        rating: driverProfilesTable.rating,
        totalTrips: driverProfilesTable.totalTrips,
        fullName: usersTable.fullName,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(driverProfilesTable)
      .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
      .where(eq(driverProfilesTable.isAvailable, true))
      .limit(20);

    res.json({ drivers: profiles, source: "db_fallback" });
    return;
  }

  const nearbyIds = nearby.map((n) => n.driverId);

  const profiles = await db
    .select({
      userId: driverProfilesTable.userId,
      vehicleType: driverProfilesTable.vehicleType,
      vehicleColor: driverProfilesTable.vehicleColor,
      plateNumber: driverProfilesTable.plateNumber,
      isAvailable: driverProfilesTable.isAvailable,
      currentLat: driverProfilesTable.currentLat,
      currentLon: driverProfilesTable.currentLon,
      rating: driverProfilesTable.rating,
      totalTrips: driverProfilesTable.totalTrips,
      fullName: usersTable.fullName,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(and(eq(driverProfilesTable.isAvailable, true)));

  const profileMap = new Map(profiles.map((p) => [p.userId, p]));
  const drivers = nearbyIds
    .filter((id) => profileMap.has(id))
    .map((id) => ({
      ...profileMap.get(id)!,
      distanceKm: nearby.find((n) => n.driverId === id)?.distanceKm ?? 0,
    }));

  res.json({ drivers, source: "redis_geo" });
});

/**
 * PUT /api/drivers/availability
 */
const AvailabilityBody = z.object({ isAvailable: z.boolean() });

router.put(
  "/drivers/availability",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = AvailabilityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (parsed.data.isAvailable) {
      await markDriverAvailable(authReq.user.id);
    } else {
      await markDriverUnavailable(authReq.user.id);
    }

    const [profile] = await db
      .select()
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, authReq.user.id));

    res.json({ profile });
  },
);

/**
 * GET /api/drivers/me
 */
router.get(
  "/drivers/me",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;

    const [profile] = await db
      .select()
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, authReq.user.id));

    if (!profile) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    res.json({ profile });
  },
);

export default router;