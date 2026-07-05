import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable,
  tripRatingsTable,
  driverProfilesTable,
  fareWalletsTable,
  fareTransactionsTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import {
  findNearestDrivers,
  publishTripUpdate,
} from "../lib/redis";
import { logger } from "../lib/logger";
import { z } from "zod";
import { parseIdParam, parsePagination } from "../lib/http";

const router: IRouter = Router();

const BASE_FARE_PHP = 40;
const PER_KM_PHP = 8;

function estimateFare(distanceKm: number): number {
  return Math.round(BASE_FARE_PHP + distanceKm * PER_KM_PHP);
}

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

async function safePublishTripUpdate(tripId: number, payload: object): Promise<void> {
  try {
    await publishTripUpdate(tripId, payload);
  } catch (err) {
    logger.warn({ err, tripId }, "Redis publish failed (non-fatal)");
  }
}

async function safeFindNearestDrivers(lat: number, lon: number, radiusKm: number, count: number) {
  try {
    return await findNearestDrivers(lat, lon, radiusKm, count);
  } catch (err) {
    logger.warn({ err }, "Redis geo query failed (non-fatal)");
    return [];
  }
}

const CreateTripBody = z.object({
  pickupLat: z.number(),
  pickupLon: z.number(),
  pickupAddress: z.string().optional(),
  dropoffLat: z.number(),
  dropoffLon: z.number(),
  dropoffAddress: z.string().optional(),
});

/**
 * POST /api/trips
 */
router.post("/trips", requireAuth, requireRole("passenger"), async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const parsed = CreateTripBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  const distanceKm = haversineKm(body.pickupLat, body.pickupLon, body.dropoffLat, body.dropoffLon);
  const fareAmount = estimateFare(distanceKm);

  const nearby = await safeFindNearestDrivers(body.pickupLat, body.pickupLon, 10, 1);

  const [trip] = await db
    .insert(tripsTable)
    .values({
      passengerId: authReq.user.id,
      pickupLat: body.pickupLat,
      pickupLon: body.pickupLon,
      pickupAddress: body.pickupAddress,
      dropoffLat: body.dropoffLat,
      dropoffLon: body.dropoffLon,
      dropoffAddress: body.dropoffAddress,
      distanceKm,
      fareAmount,
      status: nearby.length > 0 ? "matched" : "requested",
      driverId: nearby.length > 0 ? nearby[0].driverId : null,
      matchedAt: nearby.length > 0 ? new Date() : null,
    })
    .returning();

  if (nearby.length > 0) {
    await safePublishTripUpdate(trip.id, { event: "matched", trip, driverId: nearby[0].driverId });
  }

  res.status(201).json({ trip });
});

/**
 * GET /api/trips
 */
router.get("/trips", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const whereClause =
    authReq.user.role === "driver"
      ? eq(tripsTable.driverId, authReq.user.id)
      : eq(tripsTable.passengerId, authReq.user.id);

  const trips = await db
    .select()
    .from(tripsTable)
    .where(whereClause)
    .orderBy(desc(tripsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ trips, limit, offset });
});

/**
 * GET /api/trips/:id
 */
router.get("/trips/:id", requireAuth, async (req, res): Promise<void> => {
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

  const isInvolved = trip.passengerId === authReq.user.id || trip.driverId === authReq.user.id;
  if (!isInvolved && authReq.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json({ trip });
});

/**
 * POST /api/trips/:id/accept
 *
 * Uses a single conditional UPDATE (status = 'matched' AND driver_id = me)
 * as the concurrency guard instead of "read status, then write" — that
 * read-then-write pattern lets two concurrent accepts both pass the check
 * and race to overwrite each other. The UPDATE's WHERE clause makes the
 * transition itself atomic: at most one caller can ever flip a given trip
 * from 'matched' to 'in_progress'.
 */
router.post(
  "/trips/:id/accept",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const tripId = parseIdParam(req.params.id);
    if (tripId === null) {
      res.status(400).json({ error: "Invalid trip ID" });
      return;
    }

    const [updated] = await db
      .update(tripsTable)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(
        and(
          eq(tripsTable.id, tripId),
          eq(tripsTable.driverId, authReq.user.id),
          eq(tripsTable.status, "matched"),
        ),
      )
      .returning();

    if (!updated) {
      res.status(400).json({ error: "Trip not available to accept" });
      return;
    }

    await safePublishTripUpdate(tripId, { event: "accepted", trip: updated });
    res.json({ trip: updated });
  },
);

/**
 * POST /api/trips/:id/decline
 */
router.post(
  "/trips/:id/decline",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const tripId = parseIdParam(req.params.id);
    if (tripId === null) {
      res.status(400).json({ error: "Invalid trip ID" });
      return;
    }

    // Still need to read the trip first here (to know the pickup point for
    // re-matching), but the actual state transition below is guarded by the
    // same atomic conditional-update pattern as accept/complete.
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
    if (!trip || trip.driverId !== authReq.user.id || trip.status !== "matched") {
      res.status(400).json({ error: "Trip not available to decline" });
      return;
    }

    const nearby = await safeFindNearestDrivers(trip.pickupLat, trip.pickupLon, 10, 5);
    const nextDriver = nearby.find((n) => n.driverId !== authReq.user.id);

    const [updated] = await db
      .update(tripsTable)
      .set({
        status: nextDriver ? "matched" : "requested",
        driverId: nextDriver ? nextDriver.driverId : null,
        matchedAt: nextDriver ? new Date() : null,
      })
      .where(
        and(
          eq(tripsTable.id, tripId),
          eq(tripsTable.driverId, authReq.user.id),
          eq(tripsTable.status, "matched"),
        ),
      )
      .returning();

    if (!updated) {
      res.status(400).json({ error: "Trip not available to decline" });
      return;
    }

    await safePublishTripUpdate(tripId, { event: "declined", trip: updated });
    res.json({ trip: updated });
  },
);

/**
 * POST /api/trips/:id/complete
 *
 * The trip-status transition (in_progress -> completed) is claimed with a
 * conditional UPDATE *inside* the same transaction as the wallet debit. If
 * two "complete" requests race (double-tap, client retry), only the first
 * one can ever flip the status away from 'in_progress' — the second gets
 * zero rows back and fails cleanly with no wallet side effect, instead of
 * both succeeding and double-charging the passenger.
 */
router.post(
  "/trips/:id/complete",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const tripId = parseIdParam(req.params.id);
    if (tripId === null) {
      res.status(400).json({ error: "Invalid trip ID" });
      return;
    }

    try {
      const updated = await db.transaction(async (trx) => {
        // Atomic claim: exactly one concurrent caller can ever win this update.
        const [claimedTrip] = await trx
          .update(tripsTable)
          .set({ status: "completing" })
          .where(
            and(
              eq(tripsTable.id, tripId),
              eq(tripsTable.driverId, authReq.user.id),
              eq(tripsTable.status, "in_progress"),
            ),
          )
          .returning();

        if (!claimedTrip) {
          throw Object.assign(new Error("Trip cannot be completed"), { status: 400 });
        }

        const fareAmount = claimedTrip.fareAmount ?? 0;

        const [passengerWallet] = await trx
          .select()
          .from(fareWalletsTable)
          .where(eq(fareWalletsTable.userId, claimedTrip.passengerId))
          .for("update");

        if (!passengerWallet || passengerWallet.balance < fareAmount) {
          throw Object.assign(new Error("Insufficient wallet balance"), {
            status: 402,
            balance: passengerWallet?.balance ?? 0,
          });
        }

        const balanceBefore = passengerWallet.balance;
        const balanceAfter = balanceBefore - fareAmount;

        await trx
          .update(fareWalletsTable)
          .set({ balance: balanceAfter, updatedAt: new Date() })
          .where(eq(fareWalletsTable.id, passengerWallet.id));

        await trx.insert(fareTransactionsTable).values({
          walletId: passengerWallet.id,
          userId: claimedTrip.passengerId,
          amount: -fareAmount,
          type: "deduct",
          description: `Trip #${tripId} fare`,
          referenceId: String(tripId),
          idempotencyKey: `trip_complete_${tripId}`,
          balanceBefore,
          balanceAfter,
        });

        const [completedTrip] = await trx
          .update(tripsTable)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(tripsTable.id, tripId))
          .returning();

        await trx
          .update(driverProfilesTable)
          .set({
            totalTrips: sql`${driverProfilesTable.totalTrips} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(driverProfilesTable.userId, authReq.user.id));

        return completedTrip;
      });

      await safePublishTripUpdate(tripId, { event: "completed", trip: updated });
      res.json({ trip: updated });
    } catch (err: unknown) {
      const e = err as { status?: number; balance?: number; message?: string };
      if (e.status === 402) {
        res.status(402).json({ error: "Passenger has insufficient wallet balance", balance: e.balance });
        return;
      }
      if (e.status === 400) {
        res.status(400).json({ error: "Trip cannot be completed" });
        return;
      }
      logger.error({ err, tripId }, "Trip completion failed");
      res.status(500).json({ error: "Failed to complete trip" });
    }
  },
);

/**
 * POST /api/trips/:id/cancel
 */
const CancelTripBody = z.object({ reason: z.string().optional() });

router.post("/trips/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tripId = parseIdParam(req.params.id);
  if (tripId === null) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }

  const parsedBody = CancelTripBody.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  const isInvolved = trip.passengerId === authReq.user.id || trip.driverId === authReq.user.id;
  if (!isInvolved && authReq.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(tripsTable)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: parsedBody.data.reason })
    .where(and(eq(tripsTable.id, tripId), inArray(tripsTable.status, ["requested", "matched"])))
    .returning();

  if (!updated) {
    res.status(400).json({ error: "Trip cannot be cancelled at this stage" });
    return;
  }

  await safePublishTripUpdate(tripId, { event: "cancelled", trip: updated });
  res.json({ trip: updated });
});

/**
 * POST /api/trips/:id/rate
 */
const RateTripBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

router.post("/trips/:id/rate", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tripId = parseIdParam(req.params.id);
  if (tripId === null) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }

  const parsed = RateTripBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip || trip.status !== "completed") {
    res.status(400).json({ error: "Trip not available for rating" });
    return;
  }

  const isPassenger = trip.passengerId === authReq.user.id;
  const isDriver = trip.driverId === authReq.user.id;
  if (!isPassenger && !isDriver) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rateeId = isPassenger ? trip.driverId! : trip.passengerId;

  const [rating] = await db
    .insert(tripRatingsTable)
    .values({
      tripId,
      raterId: authReq.user.id,
      rateeId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    })
    .returning();

  if (isPassenger && trip.driverId) {
    await db
      .update(driverProfilesTable)
      .set({
        rating: sql`(
          SELECT COALESCE(AVG(r.rating), 0)
          FROM trip_ratings r
          JOIN trips t ON t.id = r.trip_id
          WHERE t.driver_id = ${trip.driverId}
        )`,
        updatedAt: new Date(),
      })
      .where(eq(driverProfilesTable.userId, trip.driverId));
  }

  res.status(201).json({ rating });
});

export default router;
