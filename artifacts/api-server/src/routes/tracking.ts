import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tripsTable, driverProfilesTable } from "@workspace/db";
import { verifyJwt } from "../lib/supabase";
import { usersTable } from "@workspace/db";
import { getRedisSub } from "../lib/redis";
import { parseIdParam } from "../lib/http";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const REDIS_URL = process.env.REDIS_URL;
const DB_POLL_INTERVAL_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 25000;

/**
 * GET /api/trips/:id/track/stream?token=<jwt>
 *
 * Server-Sent Events stream of the assigned driver's live position for a trip.
 *
 * Auth: the browser/native EventSource API can't attach an Authorization
 * header, so the caller passes the Supabase JWT as a `token` query param. We
 * verify it here exactly like requireAuth would, then confirm the caller is
 * the trip's passenger, driver, or an admin.
 *
 * Transport: when Redis is configured we subscribe to the driver's
 * `driver:location:<id>` pub/sub channel for true push updates. When Redis is
 * absent (e.g. a plain local dev box), we fall back to polling the driver's
 * `currentLat/currentLon` from Postgres every few seconds, so the feature
 * still works — just with slightly higher latency.
 *
 * Events emitted:
 *   event: location  data: { driverId, lat, lon, ts }
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

  const token = String(req.query.token ?? "");
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  // --- Authenticate ---------------------------------------------------------
  let userId: string;
  let role: string;
  try {
    const supabaseUser = await verifyJwt(token);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, supabaseUser.id));
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
  if (!involved && role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const driverId = trip.driverId;

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
  if (!driverId) {
    send("status", { status: trip.status });
  } else {
    // Emit the last known position right away so the map isn't empty while we
    // wait for the first live update.
    const [profile] = await db
      .select({
        lat: driverProfilesTable.currentLat,
        lon: driverProfilesTable.currentLon,
      })
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, driverId));
    if (profile?.lat != null && profile?.lon != null) {
      send("location", { driverId, lat: profile.lat, lon: profile.lon, ts: Date.now() });
    }
  }

  // --- Heartbeat ------------------------------------------------------------
  const heartbeat = setInterval(() => {
    send("ping", {});
  }, HEARTBEAT_INTERVAL_MS);

  // --- Live source: Redis pub/sub, or DB polling fallback -------------------
  let redisSub: ReturnType<typeof getRedisSub> | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    if (pollTimer) clearInterval(pollTimer);
    if (redisSub) {
      const channel = `driver:location:${driverId}`;
      redisSub.unsubscribe(channel).catch(() => {});
      // getRedisSub() returns a shared client; don't quit it, just unsubscribe.
      redisSub.removeListener("message", onMessage);
    }
  };

  function onMessage(channel: string, message: string) {
    if (closed) return;
    if (channel === `driver:location:${driverId}`) {
      try {
        const payload = JSON.parse(message);
        send("location", payload);
      } catch (err) {
        logger.warn({ err }, "Bad driver location payload on SSE");
      }
    }
  }

  if (driverId && REDIS_URL) {
    try {
      redisSub = getRedisSub();
      const channel = `driver:location:${driverId}`;
      await redisSub.subscribe(channel);
      redisSub.on("message", onMessage);
    } catch (err) {
      logger.warn({ err }, "SSE Redis subscribe failed; using DB poll");
      redisSub = null;
    }
  }

  if (driverId && !redisSub) {
    // DB-poll fallback. Also re-checks trip status so the passenger sees
    // 'in_progress' -> 'completed' transitions and we can close cleanly.
    let lastLat: number | null = null;
    let lastLon: number | null = null;
    pollTimer = setInterval(async () => {
      if (closed) return;
      try {
        const [row] = await db
          .select({
            lat: driverProfilesTable.currentLat,
            lon: driverProfilesTable.currentLon,
          })
          .from(driverProfilesTable)
          .where(eq(driverProfilesTable.userId, driverId));
        if (row?.lat != null && row?.lon != null) {
          if (row.lat !== lastLat || row.lon !== lastLon) {
            lastLat = row.lat;
            lastLon = row.lon;
            send("location", { driverId, lat: row.lat, lon: row.lon, ts: Date.now() });
          }
        }

        const [current] = await db
          .select({ status: tripsTable.status })
          .from(tripsTable)
          .where(eq(tripsTable.id, tripId));
        if (current && current.status !== trip.status) {
          send("status", { status: current.status });
          if (["completed", "cancelled"].includes(current.status)) {
            send("end", { reason: current.status });
            cleanup();
            res.end();
          }
        }
      } catch (err) {
        logger.warn({ err }, "SSE DB poll failed");
      }
    }, DB_POLL_INTERVAL_MS);
  }

  // --- Teardown on client disconnect ---------------------------------------
  req.on("close", () => {
    cleanup();
  });
});

export default router;