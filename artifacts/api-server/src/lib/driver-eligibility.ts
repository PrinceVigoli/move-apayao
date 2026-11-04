import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  driverProfilesTable,
  subscriptionsTable,
  tripsTable,
  usersTable,
  fixedLoopServicesTable,
  loopVehiclesTable,
} from "@workspace/db";

export const DRIVER_LOCATION_FRESHNESS_MS = 3 * 60 * 1000;

const hasCurrentSubscription = sql<boolean>`exists (
  select 1
  from ${subscriptionsTable}
  where ${subscriptionsTable.userId} = ${driverProfilesTable.userId}
    and ${subscriptionsTable.status} = 'active'
    and ${subscriptionsTable.startsAt} <= now()
    and ${subscriptionsTable.expiresAt} > now()
)`;

const hasNoActiveTrip = sql<boolean>`not exists (
  select 1
  from ${tripsTable}
  where ${tripsTable.driverId} = ${driverProfilesTable.userId}
    and ${tripsTable.status} in ('matched', 'accepted', 'arrived', 'in_progress')
)`;

/**
 * PostgreSQL is the authority for dispatch eligibility. Redis is only a fast
 * spatial candidate index and may contain stale members after a network
 * failure, process crash, approval change, or expired subscription.
 */
export async function getEligibleDriverProfiles(
  driverIds: string[],
  options: { requireAvailable?: boolean; requireFreshLocation?: boolean } = {},
) {
  if (driverIds.length === 0) return [];
  const requireAvailable = options.requireAvailable ?? true;
  const requireFreshLocation = options.requireFreshLocation ?? true;
  const filters = [
    inArray(driverProfilesTable.userId, driverIds),
    eq(driverProfilesTable.approvalStatus, "approved"),
    eq(driverProfilesTable.isOnShift, true),
    eq(usersTable.isActive, true),
    eq(usersTable.role, "driver"),
    hasCurrentSubscription,
    hasNoActiveTrip,
    sql<boolean>`not exists (
      select 1 from ${fixedLoopServicesTable}
      inner join ${loopVehiclesTable} on ${fixedLoopServicesTable.vehicleId} = ${loopVehiclesTable.id}
      where ${loopVehiclesTable.driverId} = ${driverProfilesTable.userId}
    )`,
  ];
  if (requireAvailable) filters.push(eq(driverProfilesTable.isAvailable, true));
  if (requireFreshLocation) {
    filters.push(
      gte(
        driverProfilesTable.lastLocationAt,
        new Date(Date.now() - DRIVER_LOCATION_FRESHNESS_MS),
      ),
    );
  }

  return db
    .select({
      userId: driverProfilesTable.userId,
      capacity: driverProfilesTable.capacity,
      currentLat: driverProfilesTable.currentLat,
      currentLon: driverProfilesTable.currentLon,
    })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(usersTable.id, driverProfilesTable.userId))
    .where(and(...filters));
}

export async function getEligibleDriverProfile(driverId: string) {
  const profiles = await getEligibleDriverProfiles([driverId], {
    requireAvailable: false,
    requireFreshLocation: true,
  });
  return profiles[0] ?? null;
}
