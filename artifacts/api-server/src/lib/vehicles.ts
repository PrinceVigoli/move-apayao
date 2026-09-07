import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  driverProfilesTable,
  fleetVehiclesTable,
  vehicleDriverAssignmentsTable,
} from "@workspace/db";

export type BestDriverLocation = {
  driverId: string;
  vehicleId: string | null;
  lat: number;
  lon: number;
  capturedAt: Date;
  source: "iot_gps" | "smartphone_gps";
  isOnShift: boolean;
};

const configuredIotTtl = Number(process.env.IOT_PRIMARY_TTL_MS ?? 45_000);
const IOT_PRIMARY_TTL_MS = Number.isFinite(configuredIotTtl)
  ? Math.min(5 * 60_000, Math.max(10_000, configuredIotTtl))
  : 45_000;

/** Returns the currently active fleet vehicle for a driver, if one exists. */
export async function getAssignedVehicleId(driverId: string): Promise<string | null> {
  const [assignment] = await db
    .select({ vehicleId: vehicleDriverAssignmentsTable.vehicleId })
    .from(vehicleDriverAssignmentsTable)
    .innerJoin(
      fleetVehiclesTable,
      eq(fleetVehiclesTable.id, vehicleDriverAssignmentsTable.vehicleId),
    )
    .where(
      and(
        eq(vehicleDriverAssignmentsTable.driverId, driverId),
        isNull(vehicleDriverAssignmentsTable.unassignedAt),
        eq(fleetVehiclesTable.isActive, true),
      ),
    )
    .limit(1);
  return assignment?.vehicleId ?? null;
}

/**
 * Resolves one canonical live position per driver. Fresh IoT telemetry wins;
 * the driver's phone remains the fallback. Callers decide their own maximum
 * public age so trip tracking and public maps can use different thresholds.
 */
export async function getBestDriverLocations(
  driverIds: string[],
): Promise<Map<string, BestDriverLocation>> {
  if (driverIds.length === 0) return new Map();

  const rows = await db
    .select({
      driverId: driverProfilesTable.userId,
      isOnShift: driverProfilesTable.isOnShift,
      phoneLat: driverProfilesTable.currentLat,
      phoneLon: driverProfilesTable.currentLon,
      phoneCapturedAt: driverProfilesTable.lastLocationAt,
      vehicleId: vehicleDriverAssignmentsTable.vehicleId,
      vehicleLat: fleetVehiclesTable.currentLat,
      vehicleLon: fleetVehiclesTable.currentLon,
      vehicleCapturedAt: fleetVehiclesTable.lastLocationAt,
    })
    .from(driverProfilesTable)
    .leftJoin(
      vehicleDriverAssignmentsTable,
      and(
        eq(vehicleDriverAssignmentsTable.driverId, driverProfilesTable.userId),
        isNull(vehicleDriverAssignmentsTable.unassignedAt),
      ),
    )
    .leftJoin(
      fleetVehiclesTable,
      and(
        eq(fleetVehiclesTable.id, vehicleDriverAssignmentsTable.vehicleId),
        eq(fleetVehiclesTable.isActive, true),
      ),
    )
    .where(inArray(driverProfilesTable.userId, [...new Set(driverIds)]));

  const now = Date.now();
  const locations = new Map<string, BestDriverLocation>();
  for (const row of rows) {
    const iotTime = row.vehicleCapturedAt?.getTime() ?? 0;
    const freshIot =
      row.vehicleLat != null &&
      row.vehicleLon != null &&
      row.vehicleCapturedAt != null &&
      iotTime >= now - IOT_PRIMARY_TTL_MS;
    if (freshIot) {
      locations.set(row.driverId, {
        driverId: row.driverId,
        vehicleId: row.vehicleId,
        lat: row.vehicleLat!,
        lon: row.vehicleLon!,
        capturedAt: row.vehicleCapturedAt!,
        source: "iot_gps",
        isOnShift: row.isOnShift,
      });
      continue;
    }
    if (row.phoneLat != null && row.phoneLon != null && row.phoneCapturedAt) {
      locations.set(row.driverId, {
        driverId: row.driverId,
        vehicleId: row.vehicleId,
        lat: row.phoneLat,
        lon: row.phoneLon,
        capturedAt: row.phoneCapturedAt,
        source: "smartphone_gps",
        isOnShift: row.isOnShift,
      });
      continue;
    }
    if (row.vehicleLat != null && row.vehicleLon != null && row.vehicleCapturedAt) {
      locations.set(row.driverId, {
        driverId: row.driverId,
        vehicleId: row.vehicleId,
        lat: row.vehicleLat,
        lon: row.vehicleLon,
        capturedAt: row.vehicleCapturedAt,
        source: "iot_gps",
        isOnShift: row.isOnShift,
      });
    }
  }
  return locations;
}
