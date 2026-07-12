import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, sql, getTableColumns } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable,
  tripRatingsTable,
  driverProfilesTable,
  fareWalletsTable,
  fareTransactionsTable,
  type Trip,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { publishTripUpdate } from "../lib/redis";
import { matchDriverForTrip } from "../lib/matching";
import { markDriverAvailable, markDriverUnavailable } from "../lib/driver-availability";
import { logger } from "../lib/logger";
import { z } from "zod";
import { parseIdParam, parsePagination } from "../lib/http";

const router: IRouter = Router();

const BASE_FARE_PHP = 40;
const PER_KM_PHP = 8;
// Group booking surcharge: the base fare covers hiring the vehicle itself
// for a point-to-point trip (not a per-seat shared-route fare), but a bigger
// party means more fuel/wear/time loading, so each seat beyond the first
// adds a modest flat fee. Adjust this if your actual fare policy differs —
// it's a simple default, not something derived from real pricing data.
const EXTRA_PASSENGER_FEE_PHP = 10;

function estimateFare(distanceKm: number, passengerCount: number): number {
  const extraPassengers = Math.max(0, passengerCount - 1);
  return Math.round(
    BASE_FARE_PHP + distanceKm * PER_KM_PHP + extraPassengers * EXTRA_PASSENGER_FEE_PHP,
  );
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

// Postgres unique_violation. Used to detect the (extremely unlikely, given
// the atomic Redis claim above) case where the DB's partial unique index on
// active trips-per-driver is what ends up catching a double-booking.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

async function safeMatchDriverForTrip(
  lat: number,
  lon: number,
  passengerCount: number,
  radiusKm: number,
  excludeDriverId?: string,
): Promise<string | null> {
  try {
    const result = await matchDriverForTrip(lat, lon, passengerCount, radiusKm, excludeDriverId);
    return result?.driverId ?? null;
  } catch (err) {
    logger.warn({ err }, "Driver matching failed (non-fatal)");
    return null;
  }
}

const CreateTripBody = z.object({
  pickupLat: z.number(),
  pickupLon: z.number(),
  pickupAddress: z.string().optional(),
  dropoffLat: z.number(),
  dropoffLon: z.number(),
  dropoffAddress: z.string().optional(),
  // Seats requested for this booking (group booking). Defaults to 1 for
  // backward compatibility with existing clients. Capped at 16 — anything
  // bigger than the largest vehicle type (van, 15) can never be matched
  // anyway, so reject it up front with a clear error instead of leaving the
  // trip stuck unmatched forever.
  passengerCount: z.number().int().min(1).max(16).default(1),
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
  const fareAmount = estimateFare(distanceKm, body.passengerCount);

  let claimedDriverId = await safeMatchDriverForTrip(
    body.pickupLat,
    body.pickupLon,
    body.passengerCount,
    10,
  );

  const baseTripValues = {
    passengerId: authReq.user.id,
    pickupLat: body.pickupLat,
    pickupLon: body.pickupLon,
    pickupAddress: body.pickupAddress,
    dropoffLat: body.dropoffLat,
    dropoffLon: body.dropoffLon,
    dropoffAddress: body.dropoffAddress,
    passengerCount: body.passengerCount,
    distanceKm,
    fareAmount,
  };

  let trip: Trip;
  try {
    [trip] = await db
      .insert(tripsTable)
      .values({
        ...baseTripValues,
        status: claimedDriverId ? "matched" : "requested",
        driverId: claimedDriverId,
        matchedAt: claimedDriverId ? new Date() : null,
      })
      .returning();
  } catch (err) {
    if (claimedDriverId && isUniqueViolation(err)) {
      // The atomic Redis claim above should make this unreachable in
      // practice — but if it's ever wrong (e.g. the DB row was already in
      // an active state some other way), the DB constraint is the last
      // line of defense. Hand the driver back and create an unmatched
      // trip instead of failing the passenger's request outright.
      logger.warn(
        { err, claimedDriverId },
        "Active-trip unique constraint hit at creation — falling back to unmatched trip",
      );
      await markDriverAvailable(claimedDriverId);
      claimedDriverId = null;
      [trip] = await db
        .insert(tripsTable)
        .values({ ...baseTripValues, status: "requested", driverId: null, matchedAt: null })
        .returning();
    } else {
      throw err;
    }
  }

  if (claimedDriverId) {
    // DB isAvailable flip for consistency (the Redis geo index was already
    // atomically claimed above — this just keeps the driver's own profile
    // state, and any UI reading it, in sync with that).
    await markDriverUnavailable(claimedDriverId);
    await safePublishTripUpdate(trip.id, { event: "matched", trip, driverId: claimedDriverId });
  }

  res.status(201).json({ trip });
});

/**
 * GET /api/trips
 */
router.get("/trips", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  // Admins see every trip (the dashboard's Trips page); drivers see trips
  // assigned to them; passengers see trips they booked.
  const whereClause =
    authReq.user.role === "admin"
      ? undefined
      : authReq.user.role === "driver"
        ? eq(tripsTable.driverId, authReq.user.id)
        : eq(tripsTable.passengerId, authReq.user.id);

  // Attach the passenger→driver rating (if given) to each row so lists can
  // show it without N follow-up requests.
  const baseQuery = db
    .select({
      ...getTableColumns(tripsTable),
      driverRating: tripRatingsTable.rating,
    })
    .from(tripsTable)
    .leftJoin(
      tripRatingsTable,
      and(
        eq(tripRatingsTable.tripId, tripsTable.id),
        eq(tripRatingsTable.raterId, tripsTable.passengerId),
      ),
    );

  const trips = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
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

  // Include the caller's own rating for this trip (if any) so the app knows
  // whether to offer the rate button or show the rating already given.
  const [myRating] = await db
    .select({ rating: tripRatingsTable.rating, comment: tripRatingsTable.comment })
    .from(tripRatingsTable)
    .where(and(eq(tripRatingsTable.tripId, tripId), eq(tripRatingsTable.raterId, authReq.user.id)));

  res.json({ trip, myRating: myRating ?? null });
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

    let nextDriverId = await safeMatchDriverForTrip(
      trip.pickupLat,
      trip.pickupLon,
      trip.passengerCount,
      10,
      authReq.user.id,
    );

    let updated: Trip | undefined;
    try {
      [updated] = await db
        .update(tripsTable)
        .set({
          status: nextDriverId ? "matched" : "requested",
          driverId: nextDriverId,
          matchedAt: nextDriverId ? new Date() : null,
        })
        .where(
          and(
            eq(tripsTable.id, tripId),
            eq(tripsTable.driverId, authReq.user.id),
            eq(tripsTable.status, "matched"),
          ),
        )
        .returning();
    } catch (err) {
      if (nextDriverId && isUniqueViolation(err)) {
        logger.warn(
          { err, tripId, nextDriverId },
          "Active-trip unique constraint hit at decline rematch — falling back to unmatched trip",
        );
        await markDriverAvailable(nextDriverId);
        nextDriverId = null;
        [updated] = await db
          .update(tripsTable)
          .set({ status: "requested", driverId: null, matchedAt: null })
          .where(
            and(
              eq(tripsTable.id, tripId),
              eq(tripsTable.driverId, authReq.user.id),
              eq(tripsTable.status, "matched"),
            ),
          )
          .returning();
      } else {
        throw err;
      }
    }

    if (!updated) {
      res.status(400).json({ error: "Trip not available to decline" });
      return;
    }

    // The declining driver is free again; whoever (if anyone) was just
    // claimed above takes over as unavailable.
    await markDriverAvailable(authReq.user.id);
    if (nextDriverId) {
      await markDriverUnavailable(nextDriverId);
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

      await markDriverAvailable(authReq.user.id);
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

  // A cancel from "requested" has no driver attached yet; a cancel from
  // "matched" does, and that driver is no longer tied up.
  if (updated.driverId) {
    await markDriverAvailable(updated.driverId);
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

  // One rating per rater per trip — without this guard, re-submitting
  // inserts duplicates and skews the driver's average.
  const [existing] = await db
    .select({ id: tripRatingsTable.id })
    .from(tripRatingsTable)
    .where(and(eq(tripRatingsTable.tripId, tripId), eq(tripRatingsTable.raterId, authReq.user.id)));
  if (existing) {
    res.status(409).json({ error: "You have already rated this trip" });
    return;
  }

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