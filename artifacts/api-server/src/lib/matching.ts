import { findNearestDrivers, claimDriver } from "./redis";
import { removeDriverGeo } from "./redis";
import { logger } from "./logger";
import { getEligibleDriverProfiles } from "./driver-eligibility";

/**
 * Capacity-aware nearest-driver matching for group bookings.
 *
 * The Redis geo index (driver:geo) only knows WHERE drivers are — it has no
 * idea how many seats their vehicle has. So matching a group booking is a
 * two-step process:
 *
 *   1. Ask Redis for the nearest N online drivers (cheap, no DB hit).
 *   2. Batch-read their `capacity` from Postgres in ONE query, then walk the
 *      list nearest-first, skipping anyone whose vehicle is too small, and
 *      attempt to atomically claim (ZREM) the first one that fits.
 *
 * A driver who's skipped for being too small is NEVER removed from the geo
 * set — they stay matchable for a smaller party that comes along next. This
 * is what makes it "capacity-aware" rather than just "nearest available":
 * a 4-seat e-trike should never get claimed by a 10-person jeepney request,
 * and a 12-seat jeepney shouldn't get skipped over for a solo passenger just
 * because a smaller vehicle happened to be a few meters closer — the loop
 * below still prefers proximity FIRST, capacity is only a filter, not a
 * re-ranking.
 *
 * Widening note: we over-fetch more geo candidates than a plain nearest-one
 * match would need (see CANDIDATE_FETCH_COUNT), since some nearby drivers
 * may be filtered out for being too small before we ever get to attempt a
 * claim.
 */

const CANDIDATE_FETCH_COUNT = 20;

export interface MatchResult {
  driverId: string;
  distanceKm: number;
}

export async function matchDriverForTrip(
  lat: number,
  lon: number,
  passengerCount: number,
  radiusKm = 10,
  excludeDriverId?: string,
): Promise<MatchResult | null> {
  const candidates = await findNearestDrivers(lat, lon, radiusKm, CANDIDATE_FETCH_COUNT);
  if (candidates.length === 0) return null;

  const relevant = candidates.filter((c) => c.driverId !== excludeDriverId);
  if (relevant.length === 0) return null;

  // Redis is a disposable spatial accelerator, not an authorization source.
  // Revalidate every candidate against PostgreSQL before attempting a claim.
  const profiles = await getEligibleDriverProfiles(relevant.map((c) => c.driverId));
  const capacityByDriver = new Map(profiles.map((p) => [p.userId, p.capacity]));

  // Proactively scrub stale/ineligible Redis members. A failed cleanup is
  // harmless because the database check above will continue to reject them.
  const eligibleIds = new Set(profiles.map((profile) => profile.userId));
  await Promise.all(
    relevant
      .filter((candidate) => !eligibleIds.has(candidate.driverId))
      .map((candidate) => removeDriverGeo(candidate.driverId).catch(() => undefined)),
  );

  for (const candidate of relevant) {
    const capacity = capacityByDriver.get(candidate.driverId);
    if (capacity == null) {
      // No driver_profiles row found (shouldn't normally happen) — skip
      // rather than risk assigning a passenger to an unknown-capacity ride.
      logger.warn({ driverId: candidate.driverId }, "Matching candidate missing driver profile");
      continue;
    }
    if (capacity < passengerCount) continue; // too small for this group — leave them claimable

    const claimed = await claimDriver(candidate.driverId);
    if (claimed) {
      return { driverId: candidate.driverId, distanceKm: candidate.distanceKm };
    }
    // Someone else claimed them between our read and this write — try the
    // next-nearest qualifying candidate.
  }

  return null;
}
