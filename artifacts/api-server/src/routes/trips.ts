import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, sql, getTableColumns, gt, isNull, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable,
  tripRatingsTable,
  driverProfilesTable,
  usersTable,
  type Trip,
} from "@workspace/db";
import {
  hasProvincialAdminAccess,
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../middlewares/auth";
import { publishTripUpdate } from "../lib/redis";
import { matchDriverForTrip } from "../lib/matching";
import { markDriverAvailable, markDriverUnavailable } from "../lib/driver-availability";
import { logger } from "../lib/logger";
import { sendPushToUser } from "../lib/push";
import { z } from "zod";
import { parseIdParam, parsePagination } from "../lib/http";
import { computeDrivingRoute } from "../lib/google-routes";
import { randomInt } from "node:crypto";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { getActiveFarePolicy } from "./fare-policy";
import { validatePilotEndpoints, validatePilotTripDistance } from "../lib/service-area";
import { getAssignedVehicleId } from "../lib/vehicles";
import { isTripContactVisible } from "../lib/trip-contact";
import {
  clearPickupPinFailures,
  getPickupPinFailures,
  recordPickupPinFailure,
  verifyDriverProximity,
} from "../lib/trip-safety";

const router: IRouter = Router();

// Group booking surcharge: the base fare covers hiring the vehicle itself
// for a point-to-point trip (not a per-seat shared-route fare), but a bigger
// party means more fuel/wear/time loading, so each seat beyond the first
// adds a modest flat fee. Adjust this if your actual fare policy differs —
// it's a simple default, not something derived from real pricing data.
const OFFER_TTL_MS = 30_000;

function estimateFare(
  distanceKm: number,
  passengerCount: number,
  policy: Awaited<ReturnType<typeof getActiveFarePolicy>>,
): number {
  const extraPassengers = Math.max(0, passengerCount - 1);
  return Math.max(
    policy.minimumFare,
    Math.round(
      policy.baseFare +
        distanceKm * policy.perKmFare +
        extraPassengers * policy.extraPassengerFare,
    ),
  );
}

async function safePublishTripUpdate(tripId: number, payload: object): Promise<void> {
  try {
    await publishTripUpdate(tripId, payload);
  } catch (err) {
    logger.warn({ err, tripId }, "Redis publish failed (non-fatal)");
  }
}

async function getTripParticipants(trip: Trip) {
  const passengerPromise = db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      phone: usersTable.phone,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, trip.passengerId))
    .limit(1);
  const driverPromise = trip.driverId
    ? db
        .select({
          id: usersTable.id,
          fullName: usersTable.fullName,
          phone: usersTable.phone,
          avatarUrl: usersTable.avatarUrl,
          vehicleType: driverProfilesTable.vehicleType,
          vehicleColor: driverProfilesTable.vehicleColor,
          plateNumber: driverProfilesTable.plateNumber,
          rating: driverProfilesTable.rating,
          totalTrips: driverProfilesTable.totalTrips,
        })
        .from(usersTable)
        .innerJoin(driverProfilesTable, eq(driverProfilesTable.userId, usersTable.id))
        .where(eq(usersTable.id, trip.driverId))
        .limit(1)
    : Promise.resolve([]);
  const [[passenger], [driver]] = await Promise.all([passengerPromise, driverPromise]);
  // Phone numbers are available only while an accepted ride is active. Trip
  // history must not become a permanent passenger/driver phone directory.
  const contactVisible = isTripContactVisible(trip.status);
  return {
    passenger: passenger ? { ...passenger, phone: contactVisible ? passenger.phone : null } : null,
    driver: driver ? { ...driver, phone: contactVisible ? driver.phone : null } : null,
  };
}

// Postgres unique_violation. Used to detect the (extremely unlikely, given
// the atomic Redis claim above) case where the DB's partial unique index on
// active trips-per-driver is what ends up catching a double-booking.
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const value = err as { code?: string; cause?: { code?: string } };
  return value.code === "23505" || value.cause?.code === "23505";
}

function uniqueConstraint(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const value = err as { constraint?: string; cause?: { constraint?: string } };
  return value.constraint ?? value.cause?.constraint;
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

const TripRouteBody = z.object({
  pickupLat: z.number().min(-90).max(90),
  pickupLon: z.number().min(-180).max(180),
  pickupAddress: z.string().trim().max(300).optional(),
  dropoffLat: z.number().min(-90).max(90),
  dropoffLon: z.number().min(-180).max(180),
  dropoffAddress: z.string().trim().max(300).optional(),
  // Seats requested for this booking (group booking). Defaults to 1 for
  // backward compatibility with existing clients. Capped at 16 — anything
  // bigger than the largest vehicle type (van, 15) can never be matched
  // anyway, so reject it up front with a clear error instead of leaving the
  // trip stuck unmatched forever.
  passengerCount: z.number().int().min(1).max(15).default(1),
});

const CreateTripBody = TripRouteBody.extend({
  clientRequestId: z.string().trim().min(8).max(120),
});

/**
 * POST /api/trips/fare-estimate
 * Uses the same road route and fare function as final trip creation so the
 * passenger never confirms a straight-line estimate and receives a different
 * server fare afterward.
 */
router.post(
  "/trips/fare-estimate",
  requireAuth,
  requireRole("passenger"),
  async (req, res): Promise<void> => {
    const parsed = TripRouteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    const endpointCheck = validatePilotEndpoints(
      { lat: body.pickupLat, lon: body.pickupLon },
      { lat: body.dropoffLat, lon: body.dropoffLon },
    );
    if (!endpointCheck.ok) {
      res.status(400).json({
        error: endpointCheck.message,
        code: "OUTSIDE_PILOT_SERVICE_AREA",
        field: endpointCheck.field,
      });
      return;
    }
    const route = await computeDrivingRoute([
      { lat: body.pickupLat, lon: body.pickupLon },
      { lat: body.dropoffLat, lon: body.dropoffLon },
    ]);
    if (route.source !== "google_routes") {
      res.status(503).json({
        error: "Road-distance pricing is temporarily unavailable. Please try again shortly.",
      });
      return;
    }
    const distanceCheck = validatePilotTripDistance(route.distanceKm);
    if (!distanceCheck.ok) {
      res.status(400).json({ error: distanceCheck.message, code: "TRIP_TOO_SHORT" });
      return;
    }
    const policy = await getActiveFarePolicy();
    res.json({
      route,
      fareAmount: estimateFare(route.distanceKm, body.passengerCount, policy),
    });
  },
);

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

  const [retry] = await db
    .select()
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.passengerId, authReq.user.id),
        eq(tripsTable.clientRequestId, body.clientRequestId),
      ),
    )
    .limit(1);
  if (retry) {
    res.status(200).json({ trip: retry, idempotentReplay: true });
    return;
  }

  const endpointCheck = validatePilotEndpoints(
    { lat: body.pickupLat, lon: body.pickupLon },
    { lat: body.dropoffLat, lon: body.dropoffLon },
  );
  if (!endpointCheck.ok) {
    res.status(400).json({
      error: endpointCheck.message,
      code: "OUTSIDE_PILOT_SERVICE_AREA",
      field: endpointCheck.field,
    });
    return;
  }

  const [activeTrip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.passengerId, authReq.user.id),
        inArray(tripsTable.status, ["requested", "matched", "accepted", "arrived", "in_progress"]),
      ),
    )
    .limit(1);
  if (activeTrip) {
    res.status(409).json({
      error: "You already have an active booking",
      activeTripId: activeTrip.id,
    });
    return;
  }

  const drivingRoute = await computeDrivingRoute([
    { lat: body.pickupLat, lon: body.pickupLon },
    { lat: body.dropoffLat, lon: body.dropoffLon },
  ]);
  if (drivingRoute.source !== "google_routes") {
    res.status(503).json({
      error: "Road-distance pricing is temporarily unavailable. No booking was created.",
    });
    return;
  }
  const distanceCheck = validatePilotTripDistance(drivingRoute.distanceKm);
  if (!distanceCheck.ok) {
    res.status(400).json({ error: distanceCheck.message, code: "TRIP_TOO_SHORT" });
    return;
  }
  const distanceKm = drivingRoute.distanceKm;
  const farePolicy = await getActiveFarePolicy();
  const fareAmount = estimateFare(distanceKm, body.passengerCount, farePolicy);

  let claimedDriverId = await safeMatchDriverForTrip(
    body.pickupLat,
    body.pickupLon,
    body.passengerCount,
    10,
  );
  let claimedVehicleId = claimedDriverId
    ? await getAssignedVehicleId(claimedDriverId)
    : null;

  const baseTripValues = {
    passengerId: authReq.user.id,
    pickupLat: body.pickupLat,
    pickupLon: body.pickupLon,
    pickupAddress: body.pickupAddress,
    dropoffLat: body.dropoffLat,
    dropoffLon: body.dropoffLon,
    dropoffAddress: body.dropoffAddress,
    passengerCount: body.passengerCount,
    clientRequestId: body.clientRequestId,
    pickupCode: String(randomInt(0, 10_000)).padStart(4, "0"),
    distanceKm: drivingRoute.distanceKm,
    fareAmount,
    farePolicyId: farePolicy.id,
    routeDurationSeconds: drivingRoute.durationSeconds,
    routePolyline: drivingRoute.encodedPolyline,
    distanceSource: drivingRoute.source,
  };

  let trip: Trip;
  try {
    [trip] = await db
      .insert(tripsTable)
      .values({
        ...baseTripValues,
        status: claimedDriverId ? "matched" : "requested",
        driverId: claimedDriverId,
        vehicleId: claimedVehicleId,
        matchedAt: claimedDriverId ? new Date() : null,
        offerExpiresAt: claimedDriverId ? new Date(Date.now() + OFFER_TTL_MS) : null,
      })
      .returning();
  } catch (err) {
    const constraint = uniqueConstraint(err);
    if (constraint === "trips_client_request_id_unique_idx") {
      if (claimedDriverId) await markDriverAvailable(claimedDriverId);
      const [existing] = await db
        .select()
        .from(tripsTable)
        .where(eq(tripsTable.clientRequestId, body.clientRequestId))
        .limit(1);
      if (existing?.passengerId === authReq.user.id) {
        res.status(200).json({ trip: existing, idempotentReplay: true });
        return;
      }
      throw err;
    }
    if (constraint === "trips_active_passenger_unique_idx") {
      if (claimedDriverId) await markDriverAvailable(claimedDriverId);
      const [existing] = await db
        .select({ id: tripsTable.id })
        .from(tripsTable)
        .where(
          and(
            eq(tripsTable.passengerId, authReq.user.id),
            inArray(tripsTable.status, ["requested", "matched", "accepted", "arrived", "in_progress"]),
          ),
        )
        .limit(1);
      res.status(409).json({ error: "You already have an active booking", activeTripId: existing?.id });
      return;
    }
    if (
      claimedDriverId &&
      isUniqueViolation(err) &&
      constraint === "trips_active_driver_unique_idx"
    ) {
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
      claimedVehicleId = null;
      [trip] = await db
        .insert(tripsTable)
        .values({
          ...baseTripValues,
          status: "requested",
          driverId: null,
          vehicleId: null,
          matchedAt: null,
          offerExpiresAt: null,
        })
        .returning();
    } else {
      if (claimedDriverId) await markDriverAvailable(claimedDriverId);
      throw err;
    }
  }

  if (claimedDriverId) {
    // DB isAvailable flip for consistency (the Redis geo index was already
    // atomically claimed above — this just keeps the driver's own profile
    // state, and any UI reading it, in sync with that).
    await markDriverUnavailable(claimedDriverId);
    await safePublishTripUpdate(trip.id, { event: "matched", trip, driverId: claimedDriverId });
    void sendPushToUser(claimedDriverId, {
      title: "New ride request",
      body: `${body.pickupAddress ?? "Pickup"} → ${body.dropoffAddress ?? "Destination"}`,
      data: { type: "trip_offer", tripId: trip.id },
    });
  }

  res.status(201).json({
    trip: {
      ...trip,
      distanceKm: drivingRoute.distanceKm,
      routeDurationSeconds: drivingRoute.durationSeconds,
      routePolyline: drivingRoute.encodedPolyline,
      distanceSource: drivingRoute.source,
    },
  });
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
    hasProvincialAdminAccess(authReq.user.role)
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
      driverRatingComment: tripRatingsTable.comment,
      driverRatingTags: tripRatingsTable.tags,
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

  res.json({
    trips: trips.map((trip) => ({
      ...trip,
      pickupCode:
        authReq.user.role === "passenger" || hasProvincialAdminAccess(authReq.user.role)
          ? trip.pickupCode
          : null,
    })),
    limit,
    offset,
  });
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
  if (!isInvolved && !hasProvincialAdminAccess(authReq.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // For a participant: their OWN rating, so the app knows whether to offer the
  // rate button or show what they already gave.
  // For an admin: the passenger's rating of the driver — an admin never rates
  // a trip themselves, so scoping to raterId would always return null and the
  // feedback comment would be invisible in the dashboard.
  const ratingWhere =
    hasProvincialAdminAccess(authReq.user.role) && !isInvolved
      ? and(eq(tripRatingsTable.tripId, tripId), eq(tripRatingsTable.raterId, trip.passengerId))
      : and(eq(tripRatingsTable.tripId, tripId), eq(tripRatingsTable.raterId, authReq.user.id));

  const [myRating] = await db
    .select({
      rating: tripRatingsTable.rating,
      comment: tripRatingsTable.comment,
      tags: tripRatingsTable.tags,
    })
    .from(tripRatingsTable)
    .where(ratingWhere);

  const participants = await getTripParticipants(trip);

  res.json({
    trip: {
      ...trip,
      // The pickup code is a passenger proof-of-presence. Drivers must enter
      // it and therefore must never receive it in a trip response.
      pickupCode:
        trip.passengerId === authReq.user.id || hasProvincialAdminAccess(authReq.user.role)
          ? trip.pickupCode
          : null,
    },
    myRating: myRating ?? null,
    ...participants,
  });
});

/**
 * POST /api/trips/:id/accept
 *
 * Uses a single conditional UPDATE (status = 'matched' AND driver_id = me)
 * as the concurrency guard instead of "read status, then write" — that
 * read-then-write pattern lets two concurrent accepts both pass the check
 * and race to overwrite each other. The UPDATE's WHERE clause makes the
 * transition itself atomic: at most one caller can ever flip a given trip
 * from 'matched' to 'accepted'.
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

    const vehicleId = await getAssignedVehicleId(authReq.user.id);

    const [updated] = await db
      .update(tripsTable)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          offerExpiresAt: null,
          vehicleId,
        })
      .where(
        and(
          eq(tripsTable.id, tripId),
          eq(tripsTable.driverId, authReq.user.id),
          eq(tripsTable.status, "matched"),
          or(
            gt(tripsTable.offerExpiresAt, new Date()),
            and(
              isNull(tripsTable.offerExpiresAt),
              gt(tripsTable.matchedAt, new Date(Date.now() - OFFER_TTL_MS)),
            ),
          ),
        ),
      )
      .returning();

    if (!updated) {
      res.status(400).json({ error: "Trip not available to accept" });
      return;
    }

    await safePublishTripUpdate(tripId, { event: "accepted", trip: updated });
    void sendPushToUser(updated.passengerId, {
      title: "Your driver accepted",
      body: "Your driver is heading to the pickup point.",
      data: { type: "trip_status", tripId, status: "accepted" },
    });
    res.json({ trip: updated });
  },
);

/**
 * POST /api/trips/:id/decline
 */
const DeclineTripBody = z.object({
  reason: z.enum(["too_far", "vehicle_issue", "unsafe_pickup", "personal_emergency", "other"]),
});

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
    const parsed = DeclineTripBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Select a reason for declining this ride" });
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
    let nextVehicleId = nextDriverId ? await getAssignedVehicleId(nextDriverId) : null;

    let updated: Trip | undefined;
    try {
      [updated] = await db
        .update(tripsTable)
        .set({
          status: nextDriverId ? "matched" : "requested",
          driverId: nextDriverId,
          vehicleId: nextVehicleId,
          matchedAt: nextDriverId ? new Date() : null,
          offerExpiresAt: nextDriverId ? new Date(Date.now() + OFFER_TTL_MS) : null,
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
      if (
        nextDriverId &&
        isUniqueViolation(err) &&
        uniqueConstraint(err) === "trips_active_driver_unique_idx"
      ) {
        logger.warn(
          { err, tripId, nextDriverId },
          "Active-trip unique constraint hit at decline rematch — falling back to unmatched trip",
        );
        await markDriverAvailable(nextDriverId);
        nextDriverId = null;
        nextVehicleId = null;
        [updated] = await db
          .update(tripsTable)
          .set({
            status: "requested",
            driverId: null,
            vehicleId: null,
            matchedAt: null,
            offerExpiresAt: null,
          })
          .where(
            and(
              eq(tripsTable.id, tripId),
              eq(tripsTable.driverId, authReq.user.id),
              eq(tripsTable.status, "matched"),
            ),
          )
          .returning();
      } else {
        if (nextDriverId) await markDriverAvailable(nextDriverId);
        throw err;
      }
    }

    if (!updated) {
      if (nextDriverId) await markDriverAvailable(nextDriverId);
      res.status(400).json({ error: "Trip not available to decline" });
      return;
    }

    // The declining driver is free again; whoever (if anyone) was just
    // claimed above takes over as unavailable.
    await markDriverAvailable(authReq.user.id);
    if (nextDriverId) {
      await markDriverUnavailable(nextDriverId);
      void sendPushToUser(nextDriverId, {
        title: "New ride request",
        body: `${trip.pickupAddress ?? "Pickup"} → ${trip.dropoffAddress ?? "Destination"}`,
        data: { type: "trip_offer", tripId },
      });
    }

    await safePublishTripUpdate(tripId, {
      event: "declined",
      trip: updated,
      reason: parsed.data.reason,
    });
    res.json({ trip: updated });
  },
);

/** Driver has reached the pickup point; the passenger can now share the PIN. */
router.post(
  "/trips/:id/arrive",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const tripId = parseIdParam(req.params.id);
    if (tripId === null) {
      res.status(400).json({ error: "Invalid trip ID" });
      return;
    }
    const [trip] = await db
      .select()
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.id, tripId),
          eq(tripsTable.driverId, authReq.user.id),
          eq(tripsTable.status, "accepted"),
        ),
      )
      .limit(1);
    if (!trip) {
      res.status(400).json({ error: "Trip is not ready for arrival" });
      return;
    }
    const proximity = await verifyDriverProximity(
      authReq.user.id,
      { lat: trip.pickupLat, lon: trip.pickupLon },
      "pickup",
    );
    if (!proximity.ok) {
      res.status(409).json({ error: proximity.message, code: proximity.code });
      return;
    }
    const [updated] = await db
      .update(tripsTable)
      .set({ status: "arrived", arrivedAt: new Date() })
      .where(
        and(
          eq(tripsTable.id, tripId),
          eq(tripsTable.driverId, authReq.user.id),
          eq(tripsTable.status, "accepted"),
        ),
      )
      .returning();
    if (!updated) {
      res.status(400).json({ error: "Trip is not ready for arrival" });
      return;
    }
    await safePublishTripUpdate(tripId, { event: "arrived", trip: updated });
    void sendPushToUser(updated.passengerId, {
      title: "Your driver has arrived",
      body: "Meet your driver and share the pickup PIN shown in the app.",
      data: { type: "trip_status", tripId, status: "arrived" },
    });
    res.json({ trip: updated });
  },
);

const StartTripBody = z.object({ pickupCode: z.string().regex(/^\d{4}$/) });

router.post(
  "/trips/:id/start",
  requireAuth,
  requireRole("driver"),
  sensitiveActionLimiter,
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const tripId = parseIdParam(req.params.id);
    const parsed = StartTripBody.safeParse(req.body);
    if (tripId === null || !parsed.success) {
      res.status(400).json({ error: "Enter the passenger's 4-digit pickup PIN" });
      return;
    }
    const [trip] = await db
      .select()
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.id, tripId),
          eq(tripsTable.driverId, authReq.user.id),
          eq(tripsTable.status, "arrived"),
        ),
      );
    if (!trip) {
      res.status(400).json({ error: "Pickup PIN is incorrect" });
      return;
    }
    const failedAttempts = await getPickupPinFailures(tripId, authReq.user.id);
    if (failedAttempts >= 5) {
      res.status(429).json({
        error: "Too many incorrect PIN attempts. Wait 15 minutes or contact operations.",
        code: "PICKUP_PIN_LOCKED",
      });
      return;
    }
    if (trip.pickupCode !== parsed.data.pickupCode) {
      const attempts = await recordPickupPinFailure(tripId, authReq.user.id);
      res.status(attempts >= 5 ? 429 : 400).json({
        error: attempts >= 5
          ? "Too many incorrect PIN attempts. Wait 15 minutes or contact operations."
          : "Pickup PIN is incorrect",
        code: attempts >= 5 ? "PICKUP_PIN_LOCKED" : "PICKUP_PIN_INCORRECT",
        attemptsRemaining: Math.max(0, 5 - attempts),
      });
      return;
    }
    await clearPickupPinFailures(tripId, authReq.user.id);
    const [updated] = await db
      .update(tripsTable)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(and(eq(tripsTable.id, tripId), eq(tripsTable.status, "arrived")))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "Trip has already changed" });
      return;
    }
    await safePublishTripUpdate(tripId, { event: "started", trip: updated });
    void sendPushToUser(updated.passengerId, {
      title: "Trip started",
      body: "Your MOVE trip is now in progress.",
      data: { type: "trip_status", tripId, status: "in_progress" },
    });
    res.json({ trip: updated });
  },
);

/**
 * POST /api/trips/:id/complete
 *
 * CASH FARE MODEL: the driver collects the fare in cash at drop-off. This
 * endpoint only records the completion — it does NOT move money. The digital
 * wallet / QR-NFC tap-to-pay flow is deferred until reader hardware is
 * procured (see POST /wallet/tap, feature-flagged off).
 *
 * The in_progress -> completed transition is still claimed with a conditional
 * UPDATE so a double-tap or client retry can't complete the same trip twice
 * (the second caller gets zero rows back and fails cleanly).
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

    const [tripToComplete] = await db
      .select({
        driverId: tripsTable.driverId,
        status: tripsTable.status,
        startedAt: tripsTable.startedAt,
        dropoffLat: tripsTable.dropoffLat,
        dropoffLon: tripsTable.dropoffLon,
      })
      .from(tripsTable)
      .where(eq(tripsTable.id, tripId))
      .limit(1);
    if (
      !tripToComplete ||
      tripToComplete.driverId !== authReq.user.id ||
      tripToComplete.status !== "in_progress"
    ) {
      res.status(400).json({ error: "Trip cannot be completed" });
      return;
    }
    const minimumTripSeconds = Math.min(
      15 * 60,
      Math.max(0, Number(process.env.TRIP_MIN_DURATION_SECONDS ?? 30)),
    );
    if (
      tripToComplete.startedAt &&
      Date.now() - tripToComplete.startedAt.getTime() < minimumTripSeconds * 1000
    ) {
      res.status(409).json({
        error: "The trip was started too recently to complete. Continue to the destination.",
        code: "TRIP_DURATION_TOO_SHORT",
      });
      return;
    }
    const proximity = await verifyDriverProximity(
      authReq.user.id,
      { lat: tripToComplete.dropoffLat, lon: tripToComplete.dropoffLon },
      "dropoff",
    );
    if (!proximity.ok) {
      res.status(409).json({ error: proximity.message, code: proximity.code });
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

        // Fare is collected in cash by the driver — nothing to debit here.
        // trips.fareAmount stays as the recorded amount, which is what all
        // revenue reporting in analytics.ts reads from.
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
      void sendPushToUser(updated.passengerId, {
        title: "You have arrived",
        body: "Trip complete. Please rate your experience.",
        data: { type: "trip_status", tripId, status: "completed" },
      });
      res.json({ trip: updated });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
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
const CancelTripBody = z.object({
  reason: z.enum([
    "changed_mind",
    "wrong_pickup",
    "driver_taking_too_long",
    "cannot_contact_driver",
    "safety_concern",
    "driver_emergency",
    "other",
  ]),
  details: z.string().trim().max(300).optional(),
});

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
  if (!isInvolved && !hasProvincialAdminAccess(authReq.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(tripsTable)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: parsedBody.data.details
        ? `${parsedBody.data.reason}: ${parsedBody.data.details}`
        : parsedBody.data.reason,
      cancelReasonCode: parsedBody.data.reason,
      cancelDetails: parsedBody.data.details,
      cancelledBy: authReq.user.id,
      offerExpiresAt: null,
    })
    .where(
      and(
        eq(tripsTable.id, tripId),
        inArray(tripsTable.status, ["requested", "matched", "accepted", "arrived"]),
      ),
    )
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
  const notifyUserId = authReq.user.id === updated.passengerId ? updated.driverId : updated.passengerId;
  if (notifyUserId) {
    void sendPushToUser(notifyUserId, {
      title: "Trip cancelled",
      body: "The booking was cancelled before pickup.",
      data: { type: "trip_status", tripId, status: "cancelled" },
    });
  }
  res.json({ trip: updated });
});

/**
 * POST /api/trips/:id/rate
 */
const RateTripBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(5).default([]),
});
const DRIVER_FEEDBACK_TAGS = new Set([
  "Safe driving",
  "Polite",
  "Clean vehicle",
  "Easy pickup",
  "Good route",
  "Unsafe driving",
]);
const PASSENGER_FEEDBACK_TAGS = new Set([
  "Ready at pickup",
  "Polite",
  "Clear directions",
  "Late pickup",
  "Unsafe behavior",
]);

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

  const allowedTags = isPassenger ? DRIVER_FEEDBACK_TAGS : PASSENGER_FEEDBACK_TAGS;
  if (parsed.data.tags.some((tag) => !allowedTags.has(tag))) {
    res.status(400).json({ error: "One or more feedback tags are invalid" });
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
      tags: parsed.data.tags,
    })
    .onConflictDoNothing({
      target: [tripRatingsTable.tripId, tripRatingsTable.raterId],
    })
    .returning();

  if (!rating) {
    res.status(409).json({ error: "You have already rated this trip" });
    return;
  }

  if (isPassenger && trip.driverId) {
    await db
      .update(driverProfilesTable)
      .set({
        rating: sql`(
          SELECT COALESCE(AVG(r.rating), 0)
          FROM trip_ratings r
          WHERE r.ratee_id = ${trip.driverId}
        )`,
        updatedAt: new Date(),
      })
      .where(eq(driverProfilesTable.userId, trip.driverId));
  }

  res.status(201).json({ rating });
});

export default router;
