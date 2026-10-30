export function getManilaDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10);
}
export function manilaDatePlus(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
export function formatManilaTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}
export function formatManilaDay(date: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00+08:00`));
}
export function fixedLoopDirection(direction: string): string {
  return direction === "to_asc" ? "Pudtol → ASC · Payanan Road" : "ASC → Pudtol · National highway";
}
export function bookingRequestId(): string {
  // Idempotency identifier only; this is not an authentication credential.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
