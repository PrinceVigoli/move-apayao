import { z } from "zod";

export const PASSENGER_LOCATION_TTL = 60;
export const PassengerPoint = z.object({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  accuracyM: z.number().finite().min(0).max(20_000).nullable(),
  capturedAt: z.string().datetime(),
});

export function recentPassengerPoint(capturedAt: string, now = Date.now()) {
  const age = now - Date.parse(capturedAt);
  return Number.isFinite(age) && age >= -5_000 && age <= 45_000;
}

export function canSharePickupLocation(
  reservation: { status: string; pickupIndex: number; source: string },
  run: {
    status: string;
    currentStopIndex: number;
    departureAt: Date;
    arrivalAt: Date;
  },
  now = Date.now(),
) {
  return (
    reservation.status === "confirmed" &&
    reservation.source === "app" &&
    ["scheduled", "boarding", "on_route"].includes(run.status) &&
    reservation.pickupIndex >= run.currentStopIndex &&
    now >= run.departureAt.getTime() - 60 * 60_000 &&
    now <= run.arrivalAt.getTime() + 60 * 60_000
  );
}

export const passengerLocationKey = (reservationId: number) =>
  `passenger:pickup:${reservationId}`;

// Updates cannot recreate a revoked session, even if a request arrives after Stop.
export const UPDATE_PASSENGER_LOCATION = `
local raw = redis.call('GET', KEYS[1])
if not raw or cjson.decode(raw).sharingId ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;
export const STOP_PASSENGER_LOCATION = `
local raw = redis.call('GET', KEYS[1])
if not raw or cjson.decode(raw).sharingId ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])`;
