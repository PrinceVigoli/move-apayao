import { and, eq, isNull } from "drizzle-orm";
import { db, fleetVehiclesTable, vehicleDriverAssignmentsTable } from "@workspace/db";

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
