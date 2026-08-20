import { and, eq, lt, gte, or, isNull } from "drizzle-orm";
import { db, tripsTable } from "@workspace/db";
import { matchDriverForTrip } from "./matching";
import { publishTripUpdate } from "./redis";
import { logger } from "./logger";
import { markDriverAvailable, markDriverUnavailable } from "./driver-availability";
import { sendPushToUser } from "./push";
import { getAssignedVehicleId } from "./vehicles";

/**
 * Background sweep that rescues trips stuck in `requested`.
 *
 * A trip lands in `requested` when booking found no driver (nobody online,
 * nobody close enough, or every nearby vehicle too small for the party).
 * Without this sweep those trips sit forever with the passenger staring at a
 * spinner. Every SWEEP_INTERVAL_MS we:
 *
 *   1. Re-attempt matching for every `requested` trip younger than
 *      REQUEST_TTL_MS — a driver may have come online, finished a ride, or
 *      moved into range since the original attempt. Matching reuses the same
 *      capacity-aware claim as booking, so a rematch can never double-assign.
 *   2. Expire `requested` trips older than REQUEST_TTL_MS to `cancelled`
 *      (cancelReason: "no_driver_available") so the passenger gets a clear
 *      terminal answer instead of an indefinite wait, and can re-book.
 *
 * Both transitions publish a trip update on Redis pub/sub, which the
 * passenger's SSE tracking stream and query refreshes pick up.
 *
 * The unique partial index trips_active_driver_unique_idx makes the UPDATE
 * to `matched` safe even if two server instances ever sweep concurrently —
 * the second writer would violate the index and we treat that as "driver
 * taken, release the claim by leaving the trip requested for the next pass".
 */
const SWEEP_INTERVAL_MS = 5_000;
const REQUEST_TTL_MS = 5 * 60 * 1000; // give up after 5 minutes of searching
const OFFER_TTL_MS = 30_000;
const MATCH_RADIUS_KM = 10;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function sweepOnce(): Promise<void> {
  if (running) return; // never overlap sweeps
  running = true;
  try {
    const cutoff = new Date(Date.now() - REQUEST_TTL_MS);
    const now = new Date();

    // --- 0. Reassign ride offers a driver did not answer -------------------
    const expiredOffers = await db
      .select()
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.status, "matched"),
          or(
            lt(tripsTable.offerExpiresAt, now),
            and(
              isNull(tripsTable.offerExpiresAt),
              lt(tripsTable.matchedAt, new Date(Date.now() - OFFER_TTL_MS)),
            ),
          ),
        ),
      )
      .limit(50);

    for (const trip of expiredOffers) {
      const previousDriverId = trip.driverId;
      if (!previousDriverId) continue;
      try {
        // Atomically release the offer first. If acceptance won the race,
        // this returns no row and the busy driver must stay out of the pool.
        const [releasedOffer] = await db
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
              eq(tripsTable.id, trip.id),
              eq(tripsTable.status, "matched"),
              eq(tripsTable.driverId, previousDriverId),
            ),
          )
          .returning();
        if (!releasedOffer) continue;

        await markDriverAvailable(previousDriverId);
        const next = await matchDriverForTrip(
          trip.pickupLat,
          trip.pickupLon,
          trip.passengerCount,
          MATCH_RADIUS_KM,
          previousDriverId,
        );
        if (!next) {
          await publishTripUpdate(trip.id, {
            event: "offer_expired",
            trip: releasedOffer,
            previousDriverId,
          }).catch(() => {});
          continue;
        }
        let updated: typeof releasedOffer | undefined;
        const nextVehicleId = await getAssignedVehicleId(next.driverId);
        try {
          [updated] = await db
            .update(tripsTable)
            .set({
              status: "matched",
              driverId: next.driverId,
              vehicleId: nextVehicleId,
              matchedAt: now,
              offerExpiresAt: new Date(Date.now() + OFFER_TTL_MS),
            })
            .where(and(eq(tripsTable.id, trip.id), eq(tripsTable.status, "requested")))
            .returning();
        } catch (err) {
          await markDriverAvailable(next.driverId);
          throw err;
        }
        if (!updated) {
          await markDriverAvailable(next.driverId);
          continue;
        }
        await markDriverUnavailable(next.driverId);
        void sendPushToUser(next.driverId, {
            title: "New ride request",
            body: `${trip.pickupAddress ?? "Pickup"} → ${trip.dropoffAddress ?? "Destination"}`,
            data: { type: "trip_offer", tripId: trip.id },
        });
        await publishTripUpdate(trip.id, {
          event: "offer_expired",
          trip: updated,
          previousDriverId,
        }).catch(() => {});
      } catch (err) {
        logger.warn({ err, tripId: trip.id }, "Expired offer reassignment failed");
      }
    }

    // --- 1. Retry matching for fresh requested trips -----------------------
    const pending = await db
      .select()
      .from(tripsTable)
      .where(and(eq(tripsTable.status, "requested"), gte(tripsTable.createdAt, cutoff)))
      .limit(50);

    for (const trip of pending) {
      try {
        const match = await matchDriverForTrip(
          trip.pickupLat,
          trip.pickupLon,
          trip.passengerCount,
          MATCH_RADIUS_KM,
        );
        if (!match) continue;

        let updated;
        const vehicleId = await getAssignedVehicleId(match.driverId);
        try {
          [updated] = await db
            .update(tripsTable)
            .set({
              driverId: match.driverId,
              vehicleId,
              status: "matched",
              matchedAt: new Date(),
              offerExpiresAt: new Date(Date.now() + OFFER_TTL_MS),
            })
            .where(and(eq(tripsTable.id, trip.id), eq(tripsTable.status, "requested")))
            .returning();
        } catch (err) {
          // The Redis claim removed this driver from the pool. Return them if
          // the database write loses a race; markDriverAvailable performs a
          // fresh eligibility/active-trip check before re-adding them.
          await markDriverAvailable(match.driverId);
          throw err;
        }

        if (updated) {
          await markDriverUnavailable(match.driverId);
          logger.info({ tripId: trip.id, driverId: match.driverId }, "Sweeper matched stuck trip");
          await publishTripUpdate(trip.id, { event: "matched", trip: updated, driverId: match.driverId }).catch(() => {});
          void sendPushToUser(match.driverId, {
            title: "New ride request",
            body: `${trip.pickupAddress ?? "Pickup"} → ${trip.dropoffAddress ?? "Destination"}`,
            data: { type: "trip_offer", tripId: trip.id },
          });
        } else {
          await markDriverAvailable(match.driverId);
        }
      } catch (err) {
        logger.warn({ err, tripId: trip.id }, "Sweeper rematch attempt failed");
      }
    }

    // --- 2. Expire requested trips past the TTL ----------------------------
    const expired = await db
      .update(tripsTable)
      .set({
        status: "cancelled",
        cancelReason: "no_driver_available",
        cancelReasonCode: "no_driver_available",
        cancelledAt: new Date(),
      })
      .where(and(eq(tripsTable.status, "requested"), lt(tripsTable.createdAt, cutoff)))
      .returning({ id: tripsTable.id });

    for (const t of expired) {
      logger.info({ tripId: t.id }, "Sweeper expired unmatched trip");
      await publishTripUpdate(t.id, { event: "expired", reason: "no_driver_available" }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "Trip sweeper pass failed");
  } finally {
    running = false;
  }
}

export function startTripSweeper(): void {
  if (timer) return;
  timer = setInterval(() => void sweepOnce(), SWEEP_INTERVAL_MS);
  logger.info(
    { intervalMs: SWEEP_INTERVAL_MS, ttlMs: REQUEST_TTL_MS },
    "Trip sweeper started",
  );
}

export function stopTripSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
