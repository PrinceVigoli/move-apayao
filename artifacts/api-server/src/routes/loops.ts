import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { loopRoutesTable, loopStopsTable, loopVehiclesTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getRedis, LOOP_GEO_KEY } from "../lib/redis";
import { parseIdParam } from "../lib/http";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function etaMinutes(distanceKm: number): number {
  const AVG_SPEED_KMH = 20;
  return Math.ceil((distanceKm / AVG_SPEED_KMH) * 60);
}

/**
 * GET /api/loops
 */
router.get("/loops", async (_req, res): Promise<void> => {
  const routes = await db.select().from(loopRoutesTable).where(eq(loopRoutesTable.isActive, true));
  res.json({ routes });
});

/**
 * GET /api/loops/:id
 */
router.get("/loops/:id", async (req, res): Promise<void> => {
  const routeId = parseIdParam(req.params.id);
  if (routeId === null) {
    res.status(400).json({ error: "Invalid route ID" });
    return;
  }

  const [route] = await db.select().from(loopRoutesTable).where(eq(loopRoutesTable.id, routeId));
  if (!route) {
    res.status(404).json({ error: "Route not found" });
    return;
  }

  const stops = await db
    .select()
    .from(loopStopsTable)
    .where(eq(loopStopsTable.routeId, routeId))
    .orderBy(loopStopsTable.sequence);

  res.json({ route, stops });
});

/**
 * GET /api/loops/:id/vehicles
 */
router.get("/loops/:id/vehicles", async (req, res): Promise<void> => {
  const routeId = parseIdParam(req.params.id);
  if (routeId === null) {
    res.status(400).json({ error: "Invalid route ID" });
    return;
  }

  const userLat = req.query.lat ? parseFloat(String(req.query.lat)) : null;
  const userLon = req.query.lon ? parseFloat(String(req.query.lon)) : null;

  const [vehicles, stops] = await Promise.all([
    db.select().from(loopVehiclesTable).where(eq(loopVehiclesTable.routeId, routeId)),
    db
      .select()
      .from(loopStopsTable)
      .where(eq(loopStopsTable.routeId, routeId))
      .orderBy(loopStopsTable.sequence),
  ]);

  const vehiclesWithEta = vehicles.map((v) => {
    const stopsWithEta = stops.map((stop) => {
      let distKm: number | null = null;
      let etaMins: number | null = null;

      if (v.currentLat != null && v.currentLon != null) {
        distKm = haversineKm(v.currentLat, v.currentLon, stop.lat, stop.lon);
        etaMins = etaMinutes(distKm);
      }

      return { ...stop, distanceKm: distKm, etaMinutes: etaMins };
    });

    let distanceFromUserKm: number | null = null;
    let etaFromUserMinutes: number | null = null;
    if (userLat != null && userLon != null && v.currentLat != null && v.currentLon != null) {
      distanceFromUserKm = haversineKm(userLat, userLon, v.currentLat, v.currentLon);
      etaFromUserMinutes = etaMinutes(distanceFromUserKm);
    }

    return { ...v, stops: stopsWithEta, distanceFromUserKm, etaFromUserMinutes };
  });

  res.json({ vehicles: vehiclesWithEta });
});

/**
 * PUT /api/loops/:id/vehicles/location
 *
 * Requires the caller to be the driver *assigned to this specific vehicle*
 * (loopVehiclesTable.driverId), not just any authenticated driver — without
 * this check any driver account could overwrite any loop vehicle's public
 * live location.
 */
const UpdateLoopLocationBody = z.object({
  vehicleId: z.number().int(),
  lat: z.number(),
  lon: z.number(),
  currentStopId: z.number().int().optional(),
});

router.put(
  "/loops/:id/vehicles/location",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = UpdateLoopLocationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [vehicle] = await db
      .update(loopVehiclesTable)
      .set({
        currentLat: parsed.data.lat,
        currentLon: parsed.data.lon,
        currentStopId: parsed.data.currentStopId,
        status: "on_route",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(loopVehiclesTable.id, parsed.data.vehicleId),
          eq(loopVehiclesTable.driverId, authReq.user.id),
        ),
      )
      .returning();

    if (!vehicle) {
      res.status(403).json({ error: "Vehicle not found or not assigned to you" });
      return;
    }

    const redis = getRedis();
    await redis.geoadd(LOOP_GEO_KEY, parsed.data.lon, parsed.data.lat, String(vehicle.id));

    res.json({ vehicle });
  },
);

/**
 * POST /api/loops  (admin)
 *
 * Route + stops are created in one transaction: previously a failure on the
 * stops insert (after the route insert had already committed) would leave
 * an orphaned route with no stops.
 */
const CreateLoopBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  baseFare: z.number().min(0).default(0),
  stops: z
    .array(
      z.object({
        name: z.string().min(1),
        sequence: z.number().int(),
        lat: z.number(),
        lon: z.number(),
      }),
    )
    .min(2),
});

router.post(
  "/loops",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateLoopBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { route, stops } = await db.transaction(async (trx) => {
      const [route] = await trx
        .insert(loopRoutesTable)
        .values({
          name: parsed.data.name,
          description: parsed.data.description,
          baseFare: parsed.data.baseFare,
        })
        .returning();

      const stops = await trx
        .insert(loopStopsTable)
        .values(
          parsed.data.stops.map((s) => ({
            routeId: route.id,
            name: s.name,
            sequence: s.sequence,
            lat: s.lat,
            lon: s.lon,
          })),
        )
        .returning();

      return { route, stops };
    });

    res.status(201).json({ route, stops });
  },
);

export default router;
