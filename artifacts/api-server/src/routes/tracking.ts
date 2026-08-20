import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tripsTable, driverProfilesTable, fleetVehiclesTable } from "@workspace/db";
import { signTrackingTicket, verifyTrackingTicket } from "../lib/tokens";
import { usersTable } from "@workspace/db";
import { getRedisSub } from "../lib/redis";
import { parseIdParam } from "../lib/http";
import { logger } from "../lib/logger";
import { hasProvincialAdminAccess } from "../middlewares/auth";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const REDIS_URL = process.env.REDIS_URL;
const DB_POLL_INTERVAL_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 25000;
const configuredIotPrimaryTtlMs = Number(process.env.IOT_PRIMARY_TTL_MS ?? 45_000);
const IOT_PRIMARY_TTL_MS = Number.isFinite(configuredIotPrimaryTtlMs)
  ? Math.min(5 * 60_000, Math.max(10_000, configuredIotPrimaryTtlMs))
  : 45_000;

async function getBestTripLocation(driverId: string, vehicleId: string | null) {
  const [driverRows, vehicleRows] = await Promise.all([
    db
      .select({
        lat: driverProfilesTable.currentLat,
        lon: driverProfilesTable.currentLon,
        capturedAt: driverProfilesTable.lastLocationAt,
      })
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, driverId))
      .limit(1),
    vehicleId
      ? db
          .select({
            lat: fleetVehiclesTable.currentLat,
            lon: fleetVehiclesTable.currentLon,
            capturedAt: fleetVehiclesTable.lastLocationAt,
          })
          .from(fleetVehiclesTable)
          .where(eq(fleetVehiclesTable.id, vehicleId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const [phone] = driverRows;
  const [vehicle] = vehicleRows;
  const vehicleTs = vehicle?.capturedAt?.getTime() ?? 0;
  const iotIsFresh =
    vehicle?.lat != null &&
    vehicle?.lon != null &&
    vehicleTs > Date.now() - IOT_PRIMARY_TTL_MS;

  if (iotIsFresh) {
    return {
      driverId,
      vehicleId,
      lat: vehicle.lat!,
      lon: vehicle.lon!,
      ts: vehicleTs,
      source: "iot_gps" as const,
    };
  }
  if (phone?.lat != null && phone?.lon != null) {
    return {
      driverId,
      vehicleId,
      lat: phone.lat,
      lon: phone.lon,
      ts: phone.capturedAt?.getTime() ?? Date.now(),
      source: "smartphone_gps" as const,
    };
  }
  if (vehicle?.lat != null && vehicle?.lon != null) {
    return {
      driverId,
      vehicleId,
      lat: vehicle.lat,
      lon: vehicle.lon,
      ts: vehicleTs || Date.now(),
      source: "iot_gps" as const,
      stale: true,
    };
  }
  return null;
}

router.post("/trips/:id/track/ticket", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tripId = parseIdParam(req.params.id);
  if (tripId === null) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }
  const involved = trip.passengerId === authReq.user.id || trip.driverId === authReq.user.id;
  if (!involved && !hasProvincialAdminAccess(authReq.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({ ticket: await signTrackingTicket(authReq.user.id, tripId), expiresIn: 120 });
});

/**
 * GET /api/trips/:id/track/stream?ticket=<short-lived-ticket>
 *
 * Server-Sent Events stream of the assigned vehicle/driver position for a trip.
 *
 * Auth: the browser/native EventSource API can't attach an Authorization
 * header, so an authenticated endpoint first exchanges the access token for
 * a two-minute, trip-scoped ticket. The long-lived access token never appears
 * in a URL, proxy log, or browser history.
 *
 * Transport: Redis streams both vehicle IoT and driver smartphone updates.
 * Fresh vehicle IoT is preferred and the phone remains a fallback. When Redis
 * is absent, the same source selection is made from Postgres, so the feature
 * still works — just with slightly higher latency.
 *
 * Events emitted:
 *   event: location  data: { driverId, vehicleId, lat, lon, ts, source }
 *   event: status    data: { status }              (when the trip state changes)
 *   event: ping      data: {}                       (heartbeat / keep-alive)
 *   event: end       data: { reason }               (stream closing)
 */
router.get("/trips/:id/track/stream", async (req, res): Promise<void> => {
  const tripId = parseIdParam(req.params.id);
  if (tripId === null) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }

  const ticket = String(req.query.ticket ?? "");
  if (!ticket) {
    res.status(401).json({ error: "Missing tracking ticket" });
    return;
  }

  // --- Authenticate ---------------------------------------------------------
  let userId: string;
  let role: string;
  try {
    const claims = await verifyTrackingTicket(ticket);
    if (claims.tripId !== tripId) throw new Error("Ticket is for another trip");
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, claims.userId));
    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not found or inactive" });
      return;
    }
    userId = user.id;
    role = user.role;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // --- Authorize against this trip -----------------------------------------
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }
  const involved = trip.passengerId === userId || trip.driverId === userId;
  if (!involved && !hasProvincialAdminAccess(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let currentDriverId = trip.driverId;
  let currentVehicleId = trip.vehicleId;
  let lastStatus = trip.status;
  let lastIotAtMs = 0;

  // --- Open the SSE stream --------------------------------------------------
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Flush headers immediately so the client's onopen fires.
  res.write(": connected\n\n");

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // If there's no driver yet (trip still 'requested'), tell the client and
  // keep the connection open — they'll get a status event once matched, and
  // can re-open to pick up the driver channel.
  if (!currentDriverId) {
    send("status", { status: trip.status });
  } else {
    // Emit the last known position right away so the map isn't empty while we
    // wait for the first live update.
    const location = await getBestTripLocation(currentDriverId, currentVehicleId);
    if (location) {
      if (location.source === "iot_gps") lastIotAtMs = location.ts;
      send("location", location);
    }
  }

  // --- Heartbeat ------------------------------------------------------------
  const heartbeat = setInterval(() => {
    send("ping", {});
  }, HEARTBEAT_INTERVAL_MS);

  // --- Live source: Redis pub/sub, or DB polling fallback -------------------
  let redisSub: ReturnType<typeof getRedisSub> | null = null;
  let subscribedChannels: string[] = [];
  let pollTimer: NodeJS.Timeout | null = null;
  let closed = false;
  let polling = false;
  let lastLat: number | null = null;
  let lastLon: number | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    if (pollTimer) clearInterval(pollTimer);
    if (redisSub) {
      redisSub.removeListener("message", onMessage);
      const disconnect = subscribedChannels.length > 0
        ? redisSub.unsubscribe(...subscribedChannels)
        : Promise.resolve();
      disconnect
        .catch(() => {})
        .finally(() => redisSub?.disconnect());
    }
  };

  function onMessage(channel: string, message: string) {
    if (closed) return;
    if (!subscribedChannels.includes(channel)) return;
    try {
      const payload = JSON.parse(message) as {
        lat?: number;
        lon?: number;
        ts?: number;
      };
      if (typeof payload.lat !== "number" || typeof payload.lon !== "number") return;

      const isIot = channel.startsWith("vehicle:location:");
      if (isIot) {
        // Freshness here means the server just received an IoT event. Keep the
        // original capture timestamp in the payload for the passenger UI.
        lastIotAtMs = Date.now();
      } else if (Date.now() - lastIotAtMs <= IOT_PRIMARY_TTL_MS) {
        return;
      }

      lastLat = payload.lat;
      lastLon = payload.lon;
      send("location", {
        ...payload,
        driverId: currentDriverId,
        vehicleId: currentVehicleId,
        source: isIot ? "iot_gps" : "smartphone_gps",
      });
    } catch (err) {
      logger.warn({ err }, "Bad location payload on SSE");
    }
  }

  async function switchRedisSources(
    driverId: string | null,
    vehicleId: string | null,
  ): Promise<void> {
    if (!REDIS_URL || closed) return;
    try {
      if (!redisSub) {
        // Each stream gets a dedicated subscriber. Unsubscribing one client
        // must never silence another passenger watching the same driver.
        redisSub = getRedisSub().duplicate();
        redisSub.on("message", onMessage);
      }
      if (subscribedChannels.length > 0) {
        await redisSub.unsubscribe(...subscribedChannels);
      }
      subscribedChannels = [
        ...(driverId ? [`driver:location:${driverId}`] : []),
        ...(vehicleId ? [`vehicle:location:${vehicleId}`] : []),
      ];
      if (subscribedChannels.length > 0) {
        await redisSub.subscribe(...subscribedChannels);
      }
    } catch (err) {
      logger.warn({ err }, "SSE Redis subscribe failed; using DB poll");
      redisSub?.removeListener("message", onMessage);
      redisSub?.disconnect();
      redisSub = null;
      subscribedChannels = [];
    }
  }

  await switchRedisSources(currentDriverId, currentVehicleId);

  // Always poll assignment and status. A stream may be opened while a trip is
  // still requested, and an offered driver may decline or time out later.
  // Redis supplies low-latency coordinates; PostgreSQL remains the authority
  // for which driver the passenger is allowed to track.
  pollTimer = setInterval(async () => {
    if (closed || polling) return;
    polling = true;
    try {
      const [current] = await db
        .select({
          status: tripsTable.status,
          driverId: tripsTable.driverId,
          vehicleId: tripsTable.vehicleId,
        })
        .from(tripsTable)
        .where(eq(tripsTable.id, tripId));

      if (!current) {
        send("end", { reason: "trip_not_found" });
        cleanup();
        res.end();
        return;
      }

      if (
        current.driverId !== currentDriverId ||
        current.vehicleId !== currentVehicleId
      ) {
        currentDriverId = current.driverId;
        currentVehicleId = current.vehicleId;
        lastIotAtMs = 0;
        lastLat = null;
        lastLon = null;
        await switchRedisSources(currentDriverId, currentVehicleId);
      }

      if (current.status !== lastStatus) {
        lastStatus = current.status;
        send("status", { status: current.status });
      }

      if (["completed", "cancelled"].includes(current.status)) {
        send("end", { reason: current.status });
        cleanup();
        res.end();
        return;
      }

      if (currentDriverId && !redisSub) {
        try {
          const location = await getBestTripLocation(currentDriverId, currentVehicleId);
          if (location) {
            if (location.lat !== lastLat || location.lon !== lastLon) {
              lastLat = location.lat;
              lastLon = location.lon;
              if (location.source === "iot_gps") lastIotAtMs = location.ts;
              send("location", location);
            }
          }
        } catch (err) {
          logger.warn({ err }, "SSE location DB poll failed");
        }
      }
    } catch (err) {
      logger.warn({ err }, "SSE DB poll failed");
    } finally {
      polling = false;
    }
  }, DB_POLL_INTERVAL_MS);

  // --- Teardown on client disconnect ---------------------------------------
  req.on("close", () => {
    cleanup();
  });
});

export default router;
