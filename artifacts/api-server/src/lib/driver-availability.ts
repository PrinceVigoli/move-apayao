import { eq } from "drizzle-orm";
import { db, driverProfilesTable } from "@workspace/db";
import { updateDriverGeo, removeDriverGeo } from "./redis";
import { logger } from "./logger";

/**
 * Single place that keeps `driver_profiles.is_available` and the Redis geo
 * index (the thing trip-matching actually reads) in sync. Before this, the
 * trip lifecycle never touched `isAvailable` at all — a driver stayed fully
 * visible to the matcher for new trips while already driving someone else,
 * because their location pings (needed for the rider's live map) kept
 * re-adding them to the geo set regardless of their actual status.
 *
 * Call `markDriverUnavailable` the moment a driver is matched/assigned to a
 * trip, and `markDriverAvailable` the moment they're free again (trip
 * completed/cancelled/declined). Redis failures here are logged but never
 * thrown — matching degrades, it doesn't take down the request.
 */

export async function markDriverUnavailable(driverId: string): Promise<void> {
  await db
    .update(driverProfilesTable)
    .set({ isAvailable: false, updatedAt: new Date() })
    .where(eq(driverProfilesTable.userId, driverId));

  try {
    await removeDriverGeo(driverId);
  } catch (err) {
    logger.warn({ err, driverId }, "Redis geo remove failed while marking driver unavailable (non-fatal)");
  }
}

export async function markDriverAvailable(driverId: string): Promise<void> {
  const [profile] = await db
    .update(driverProfilesTable)
    .set({ isAvailable: true, updatedAt: new Date() })
    .where(eq(driverProfilesTable.userId, driverId))
    .returning({ currentLat: driverProfilesTable.currentLat, currentLon: driverProfilesTable.currentLon });

  // Re-add them to the searchable geo set using their last known position,
  // so they're immediately matchable again instead of waiting for their
  // next GPS ping (which, for an idle driver, could be a while out).
  if (profile?.currentLat != null && profile?.currentLon != null) {
    try {
      await updateDriverGeo(driverId, profile.currentLat, profile.currentLon);
    } catch (err) {
      logger.warn({ err, driverId }, "Redis geo update failed while marking driver available (non-fatal)");
    }
  }
}