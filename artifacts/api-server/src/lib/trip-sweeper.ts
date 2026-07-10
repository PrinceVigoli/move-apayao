import { and, eq, lt, gte, inArray } from "drizzle-orm";
import { db, tripsTable } from "@workspace/db";
import { matchDriverForTrip } from "./matching";
import { publishTripUpdate } from "./redis";
import { logger } from "./logger";

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
const SWEEP_INTERVAL_MS = 15_000;
const REQUEST_TTL_MS = 5 * 60 * 1000; // give up after 5 minutes of searching
const MATCH_RADIUS_KM = 10;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function sweepOnce(): Promise<void> {
  if (running) return; // never overlap sweeps
  running = true;
  try {
    const cutoff = new Date(Date.now() - REQUEST_TTL_MS);

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

        const [updated] = await db
          .update(tripsTable)
          .set({ driverId: match.driverId, status: "matched", matchedAt: new Date() })
          .where(and(eq(tripsTable.id, trip.id), eq(tripsTable.status, "requested")))
          .returning();

        if (updated) {
          logger.info({ tripId: trip.id, driverId: match.driverId }, "Sweeper matched stuck trip");
          await publishTripUpdate(trip.id, { event: "matched", trip: updated, driverId: match.driverId }).catch(() => {});
        }
      } catch (err) {
        // A unique-index violation here means the claimed driver got an
        // active trip between our claim and this write (rare race). The geo
        // claim already removed them from the pool, so just log and move on;
        // this trip stays `requested` for the next pass.
        logger.warn({ err, tripId: trip.id }, "Sweeper rematch attempt failed");
      }
    }

    // --- 2. Expire requested trips past the TTL ----------------------------
    const expired = await db
      .update(tripsTable)
      .set({
        status: "cancelled",
        cancelReason: "no_driver_available",
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
