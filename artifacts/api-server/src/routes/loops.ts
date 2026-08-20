import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogsTable, loopRoutesTable, loopStopsTable, loopVehiclesTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getRedis, LOOP_GEO_KEY } from "../lib/redis";
import { parseIdParam } from "../lib/http";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middlewares/auth";
import { computeDrivingRoute } from "../lib/google-routes";
import { logger } from "../lib/logger";

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
  const routes = await db
    .select()
    .from(loopRoutesTable)
    .where(eq(loopRoutesTable.isActive, true))
    .orderBy(desc(loopRoutesTable.createdAt));
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

  const includeRoadRoute = req.query.includeRoute === "true";
  let responseRoute = route;
  // Newly-created routes already persist their Google geometry. Reuse it so
  // opening the viewer does not generate another billable Routes API call.
  // Older rows are hydrated once when first viewed successfully.
  if (includeRoadRoute && stops.length >= 2 && !route.routePolyline) {
    const roadRoute = await computeDrivingRoute(
      stops.map((stop) => ({ lat: stop.lat, lon: stop.lon })),
    );
    responseRoute = {
      ...route,
      distanceKm: roadRoute.distanceKm,
      routeDurationSeconds: roadRoute.durationSeconds,
      routePolyline: roadRoute.encodedPolyline,
      distanceSource: roadRoute.source,
    };
    if (roadRoute.source === "google_routes" && roadRoute.encodedPolyline) {
      await db
        .update(loopRoutesTable)
        .set({
          distanceKm: roadRoute.distanceKm,
          routeDurationSeconds: roadRoute.durationSeconds,
          routePolyline: roadRoute.encodedPolyline,
          distanceSource: roadRoute.source,
        })
        .where(eq(loopRoutesTable.id, routeId));
    }
  }

  res.json({
    route: responseRoute,
    stops,
  });
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
  vehicleId: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  currentStopId: z.number().int().positive().optional(),
});

router.put(
  "/loops/:id/vehicles/location",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const routeId = parseIdParam(req.params.id);
    const parsed = UpdateLoopLocationBody.safeParse(req.body);
    if (routeId === null) {
      res.status(400).json({ error: "Invalid loop route ID" });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (parsed.data.currentStopId) {
      const [stop] = await db
        .select({ id: loopStopsTable.id })
        .from(loopStopsTable)
        .where(
          and(
            eq(loopStopsTable.id, parsed.data.currentStopId),
            eq(loopStopsTable.routeId, routeId),
          ),
        );
      if (!stop) {
        res.status(400).json({ error: "Current stop does not belong to this loop route" });
        return;
      }
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
          eq(loopVehiclesTable.routeId, routeId),
          eq(loopVehiclesTable.driverId, authReq.user.id),
        ),
      )
      .returning();

    if (!vehicle) {
      res.status(403).json({ error: "Vehicle not found or not assigned to you" });
      return;
    }

    try {
      await getRedis().geoadd(LOOP_GEO_KEY, parsed.data.lon, parsed.data.lat, String(vehicle.id));
    } catch (err) {
      logger.warn({ err, vehicleId: vehicle.id }, "Loop vehicle Redis update failed");
    }

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
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  baseFare: z.number().min(0).default(0),
  stops: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        sequence: z.number().int().positive(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      }),
    )
    .min(2),
});

const PreviewLoopRouteBody = z.object({
  stops: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      }),
    )
    .min(2)
    .max(25),
});

/** Road-following preview used by the admin route designer. */
router.post(
  "/admin/loops/route-preview",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = PreviewLoopRouteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const route = await computeDrivingRoute(parsed.data.stops);
    if (route.source !== "google_routes") {
      res.status(503).json({ error: "Google road-route preview is temporarily unavailable" });
      return;
    }
    res.json({ route });
  },
);

router.post(
  "/loops",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = CreateLoopBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const routeGeometry = await computeDrivingRoute(
      parsed.data.stops.map((stop) => ({ lat: stop.lat, lon: stop.lon })),
    );
    if (routeGeometry.source !== "google_routes") {
      res.status(503).json({
        error: "A road-following route could not be verified, so the loop was not published.",
      });
      return;
    }

    const { route, stops } = await db.transaction(async (trx) => {
      const [route] = await trx
        .insert(loopRoutesTable)
        .values({
          name: parsed.data.name,
          description: parsed.data.description,
          baseFare: parsed.data.baseFare,
          distanceKm: routeGeometry.distanceKm,
          routeDurationSeconds: routeGeometry.durationSeconds,
          routePolyline: routeGeometry.encodedPolyline,
          distanceSource: routeGeometry.source,
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

      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        action: "loop.created",
        metadata: {
          targetType: "loop_route",
          targetId: String(route.id),
          name: route.name,
          stopCount: stops.length,
          distanceKm: route.distanceKm,
          distanceSource: route.distanceSource,
        },
      });

      return { route, stops };
    });

    res.status(201).json({ route, stops });
  },
);

export default router;
