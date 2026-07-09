/**
 * Default passenger capacity per vehicle type, used to seed
 * driver_profiles.capacity at registration when the driver doesn't (or
 * can't) specify one.
 *
 * These are fixed defaults, not hard limits — a driver's capacity can later
 * be edited per-vehicle (e.g. two "jeepney" drivers running different-sized
 * units), but new signups get a sensible number automatically so matching
 * works correctly from day one.
 */
const DEFAULT_CAPACITY_BY_VEHICLE_TYPE: Record<string, number> = {
  "e-trike": 4,
  tricycle: 4,
  jeepney: 12,
  van: 15,
};

const FALLBACK_CAPACITY = 4;

export function defaultCapacityForVehicleType(vehicleType: string | undefined | null): number {
  if (!vehicleType) return FALLBACK_CAPACITY;
  return DEFAULT_CAPACITY_BY_VEHICLE_TYPE[vehicleType.toLowerCase()] ?? FALLBACK_CAPACITY;
}
