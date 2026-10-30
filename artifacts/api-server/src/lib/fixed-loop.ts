import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db, auditLogsTable, driverProfilesTable, fixedLoopPlacesTable as places, fixedLoopReservationsTable as reservations, fixedLoopRunsTable as runs, fixedLoopServicesTable as services, loopVehiclesTable, usersTable } from "@workspace/db";
import { BOOKING_DAYS, dailyDepartures, FIXED_LOOP_KEY, SEATED_CAPACITY, STANDING_CAPACITY, validBookingDate } from "./fixed-loop-schedule";
import { getBestDriverLocations } from "./vehicles";

export type FixedRun = typeof runs.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Allocation = typeof places.$inferSelect;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;
export class FixedLoopError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function loadService() {
  const [row] = await db.select({ service: services, driverId: loopVehiclesTable.driverId, active: usersTable.isActive, role: usersTable.role, approval: driverProfilesTable.approvalStatus, onShift: driverProfilesTable.isOnShift })
    .from(services).innerJoin(loopVehiclesTable, eq(services.vehicleId, loopVehiclesTable.id))
    .innerJoin(usersTable, eq(loopVehiclesTable.driverId, usersTable.id))
    .innerJoin(driverProfilesTable, eq(usersTable.id, driverProfilesTable.userId))
    .where(eq(services.key, FIXED_LOOP_KEY)).limit(1);
  return row ?? null;
}

export function published(row: Awaited<ReturnType<typeof loadService>>) {
  return !!row && row.service.enabled && row.active && row.role === "driver" && row.approval === "approved";
}

export async function serviceResponse() {
  const row = await loadService();
  if (!published(row) || !row) return { service: null };
  const location = (await getBestDriverLocations([row.driverId])).get(row.driverId);
  const fresh = location && location.isOnShift && location.capturedAt.getTime() >= Date.now() - 3 * 60_000;
  const [activeRun] = await db.select().from(runs).where(and(eq(runs.serviceId, row.service.id), inArray(runs.status, ["boarding", "on_route"]))).limit(1);
  return { service: {
    id: row.service.id, name: row.service.name, vehicleId: row.service.vehicleId, unitLabel: row.service.unitLabel,
    seatedCapacity: SEATED_CAPACITY, standingCapacity: STANDING_CAPACITY, bookingDays: BOOKING_DAYS,
    outboundStops: row.service.outboundStops, returnStops: row.service.returnStops,
    vehicleStatus: activeRun?.status ?? (row.onShift ? "scheduled" : "off_duty"),
    location: fresh ? { lat: location.lat, lon: location.lon, updatedAt: location.capturedAt.toISOString() } : null,
    activeRun: activeRun ? runResponse(activeRun) : null,
  } };
}

export async function ensureRuns(service: typeof services.$inferSelect, date: string) {
  if (!validBookingDate(date)) throw new FixedLoopError(400, "Choose a date within the next seven days in Philippine time.");
  const existing = await db.select({ id: runs.id }).from(runs).where(and(eq(runs.serviceId, service.id), eq(runs.serviceDate, date)));
  if (existing.length >= 16) return;
  await db.insert(runs).values(dailyDepartures(date).map(leg => ({ ...leg, serviceId: service.id, vehicleId: service.vehicleId, unitLabel: service.unitLabel, serviceDate: date, stops: leg.direction === "to_asc" ? service.outboundStops : service.returnStops })))
    .onConflictDoNothing({ target: [runs.serviceId, runs.departureAt] });
}

export function runResponse(run: FixedRun) {
  return {
    id: run.id, serviceDate: run.serviceDate, direction: run.direction, unitLabel: run.unitLabel,
    departureAt: run.departureAt.toISOString(), arrivalAt: run.arrivalAt.toISOString(),
    stops: run.stops, status: run.status, currentStopIndex: run.currentStopIndex,
    bookingOpen: ["scheduled", "boarding"].includes(run.status) && run.departureAt.getTime() > Date.now(),
  };
}

export function assertJourney(run: FixedRun, pickupIndex: number, dropoffIndex: number) {
  if (pickupIndex < 0 || dropoffIndex <= pickupIndex || dropoffIndex >= run.stops.length) {
    throw new FixedLoopError(400, "Choose pickup and drop-off stops in this run's travel order.");
  }
}

export async function availablePlaces(reader: Reader, run: FixedRun, pickupIndex: number, dropoffIndex: number) {
  assertJourney(run, pickupIndex, dropoffIndex);
  const occupied = await reader.select().from(places).where(and(eq(places.runId, run.id), isNull(places.releasedAt), gte(places.segment, pickupIndex), lt(places.segment, dropoffIndex)));
  const usedSeats = new Set(occupied.filter(p => p.placeType === "seated").map(p => p.placeNumber));
  const usedStanding = new Set(occupied.filter(p => p.placeType === "standing").map(p => p.placeNumber));
  return {
    availableSeats: Array.from({ length: SEATED_CAPACITY }, (_, i) => i + 1).filter(n => !usedSeats.has(n)),
    availableStanding: Array.from({ length: STANDING_CAPACITY }, (_, i) => i + 1).filter(n => !usedStanding.has(n)),
  };
}

export function ticketResponse(reservation: Reservation, run: FixedRun, allocations: Allocation[], passengerName?: string | null) {
  return {
    id: reservation.id, reference: `PL-${String(reservation.id).padStart(6, "0")}`, run: runResponse(run),
    pickupIndex: reservation.pickupIndex, dropoffIndex: reservation.dropoffIndex,
    pickupName: run.stops[reservation.pickupIndex]!.name, dropoffName: run.stops[reservation.dropoffIndex]!.name,
    seats: [...new Set(allocations.filter(p => p.placeType === "seated").map(p => p.placeNumber))].sort((a,b) => a-b),
    standing: [...new Set(allocations.filter(p => p.placeType === "standing").map(p => p.placeNumber))].sort((a,b) => a-b),
    status: reservation.status, source: reservation.source, createdAt: reservation.createdAt.toISOString(),
    ...(passengerName !== undefined ? { passengerName } : {}),
  };
}

export async function lockRun(tx: Transaction, id: number) {
  const [run] = await tx.select().from(runs).where(eq(runs.id, id)).for("update");
  if (!run) throw new FixedLoopError(404, "Departure not found.");
  return run;
}

export async function getRun(id: number) {
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) throw new FixedLoopError(404, "Departure not found.");
  return run;
}

export async function requireOperator(user: { id: string; role: string }, run: FixedRun) {
  if (user.role === "admin" || user.role === "superadmin") return;
  const [assignment] = await db.select({ driverId: loopVehiclesTable.driverId, approval: driverProfilesTable.approvalStatus }).from(loopVehiclesTable)
    .innerJoin(driverProfilesTable, eq(loopVehiclesTable.driverId, driverProfilesTable.userId)).where(eq(loopVehiclesTable.id, run.vehicleId));
  if (user.role !== "driver" || assignment?.driverId !== user.id || assignment.approval !== "approved") throw new FixedLoopError(403, "This run is assigned to another operator.");
}

export async function allocate(tx: Transaction, run: FixedRun, actorId: string, body: { requestId: string; pickupIndex: number; dropoffIndex: number; seats: number[]; standing: number[] }, source: "app" | "walk_in") {
  assertJourney(run, body.pickupIndex, body.dropoffIndex);
  const [existing] = await tx.select().from(reservations).where(and(eq(reservations.bookedById, actorId), eq(reservations.requestId, body.requestId)));
  if (existing) {
    if (existing.runId !== run.id || existing.source !== source || existing.pickupIndex !== body.pickupIndex || existing.dropoffIndex !== body.dropoffIndex) throw new FixedLoopError(409, "This request was already used for a different reservation.");
    const allocations = await tx.select().from(places).where(eq(places.reservationId, existing.id));
    const ticket = ticketResponse(existing, run, allocations);
    const normalized = (values: number[]) => [...values].sort((a,b)=>a-b).join(",");
    if (normalized(ticket.seats) !== normalized(body.seats) || normalized(ticket.standing) !== normalized(body.standing)) {
      throw new FixedLoopError(409, "This request was already used for a different reservation.");
    }
    return ticket;
  }
  const [service] = await tx.select().from(services).where(eq(services.id, run.serviceId));
  if (!service?.enabled || service.key !== FIXED_LOOP_KEY) throw new FixedLoopError(409, "This fixed-loop service is unavailable.");
  const [operator] = await tx.select({ id: usersTable.id }).from(loopVehiclesTable)
    .innerJoin(usersTable, eq(loopVehiclesTable.driverId, usersTable.id))
    .innerJoin(driverProfilesTable, eq(usersTable.id, driverProfilesTable.userId))
    .where(and(eq(loopVehiclesTable.id, run.vehicleId), eq(usersTable.isActive, true), eq(usersTable.role, "driver"), eq(driverProfilesTable.approvalStatus, "approved")));
  if (!operator) throw new FixedLoopError(409, "The assigned operator is unavailable.");
  if (source === "app" && !validBookingDate(run.serviceDate)) throw new FixedLoopError(409, "This departure is outside the booking window.");
  if (source === "app" && !runResponse(run).bookingOpen) throw new FixedLoopError(409, "Reservations for this departure have closed.");
  if (source === "walk_in" && (!["boarding", "on_route"].includes(run.status) || body.pickupIndex !== run.currentStopIndex)) throw new FixedLoopError(409, "Record walk-ins at the vehicle's current stop during an active run.");
  if (source === "app") {
    const [active] = await tx.select({ id: reservations.id }).from(reservations).where(and(eq(reservations.runId, run.id), eq(reservations.passengerId, actorId), inArray(reservations.status, ["confirmed", "boarded"])));
    if (active) throw new FixedLoopError(409, "You already have a reservation on this departure. Cancel it before changing places.");
  }
  const available = await availablePlaces(tx, run, body.pickupIndex, body.dropoffIndex);
  if (!body.seats.every(n => available.availableSeats.includes(n)) || !body.standing.every(n => available.availableStanding.includes(n))) throw new FixedLoopError(409, "Some selected places were just booked. Refresh availability and choose again.");
  const [created] = await tx.insert(reservations).values({ runId: run.id, passengerId: source === "app" ? actorId : null, bookedById: actorId, requestId: body.requestId, pickupIndex: body.pickupIndex, dropoffIndex: body.dropoffIndex, source, status: source === "walk_in" ? "boarded" : "confirmed" }).returning();
  const allocations = Array.from({ length: body.dropoffIndex - body.pickupIndex }, (_, i) => body.pickupIndex + i).flatMap(segment => [
    ...body.seats.map(placeNumber => ({ reservationId: created!.id, runId: run.id, placeType: "seated", placeNumber, segment })),
    ...body.standing.map(placeNumber => ({ reservationId: created!.id, runId: run.id, placeType: "standing", placeNumber, segment })),
  ]);
  const saved = await tx.insert(places).values(allocations).returning();
  await tx.insert(auditLogsTable).values({ actorUserId: actorId, action: source === "app" ? "fixed_loop.reserved" : "fixed_loop.walk_in", metadata: { reservationId: created!.id, runId: run.id, seated: body.seats.length, standing: body.standing.length } });
  return ticketResponse(created!, run, saved);
}

export async function releaseReservation(tx: Transaction, id: number, status: "cancelled" | "completed" | "no_show") {
  await tx.update(reservations).set({ status }).where(eq(reservations.id, id));
  await tx.update(places).set({ releasedAt: new Date() }).where(and(eq(places.reservationId, id), isNull(places.releasedAt)));
}

export async function reservationsForRun(run: FixedRun) {
  const rows = await db.select({ reservation: reservations, name: usersTable.fullName }).from(reservations)
    .leftJoin(usersTable, eq(reservations.passengerId, usersTable.id)).where(eq(reservations.runId, run.id)).orderBy(asc(reservations.pickupIndex), asc(reservations.createdAt));
  const allocations = rows.length ? await db.select().from(places).where(inArray(places.reservationId, rows.map(r=>r.reservation.id))) : [];
  return rows.map(row => ticketResponse(row.reservation, run, allocations.filter(p=>p.reservationId===row.reservation.id), row.reservation.source === "walk_in" ? "Walk-in" : row.name));
}
