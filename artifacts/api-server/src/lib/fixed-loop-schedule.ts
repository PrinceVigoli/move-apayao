export const FIXED_LOOP_KEY = "pudtol-luna";
export const SEATED_CAPACITY = 19;
export const STANDING_CAPACITY = 10;
export const BOOKING_DAYS = 7;

export function manilaDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function validBookingDate(date: string): boolean {
  const today = manilaDate();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= addDays(today, BOOKING_DAYS - 1)
    && Number.isFinite(Date.parse(`${date}T00:00:00+08:00`))
    && manilaDate(new Date(`${date}T00:00:00+08:00`)) === date;
}

// Confirmed daily directional legs; no overlapping opposite-direction runs.
export function dailyDepartures(date: string) {
  return [360, 390, 420, 450, 480, 510, 660, 690, 720, 750, 960, 990, 1020, 1050, 1080, 1110].map((minute, index) => {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const departureAt = new Date(`${date}T${time}:00+08:00`);
    return { departureAt, arrivalAt: new Date(departureAt.getTime() + 30 * 60_000), direction: index % 2 === 0 ? "to_pudtol" as const : "to_asc" as const };
  });
}
