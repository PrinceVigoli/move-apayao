import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auditLogsTable, db, fixedLoopPlacesTable as places, fixedLoopReservationsTable as reservations, fixedLoopRunsTable as runs, fixedLoopServicesTable as services, loopVehiclesTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { parseIdParam, parsePagination } from "../lib/http";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { z } from "zod";
import { allocate, availablePlaces, ensureRuns, FixedLoopError, getRun, loadService, lockRun, published, releaseReservation, requireOperator, reservationsForRun, runResponse, serviceResponse, ticketResponse } from "../lib/fixed-loop";
import { manilaDate } from "../lib/fixed-loop-schedule";
import { sendPushToUser } from "../lib/push";

const router: IRouter = Router();
// Inventory, vehicle location and tickets must be refreshed from the server.
router.use('/fixed-loop', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const safe = (handler: (req: AuthenticatedRequest, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await handler(req as AuthenticatedRequest, res); }
  catch (error) {
    if (error instanceof FixedLoopError) { res.status(error.status).json({ error: error.message }); return; }
    const pgCode = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
    if (pgCode === "23505") { res.status(409).json({ error: "A place or active run has just changed. Refresh and try again." }); return; }
    next(error);
  }
};
function idParam(value: unknown) {
  const id = parseIdParam(value as string);
  if (id === null) throw new FixedLoopError(400, "Invalid ID.");
  return id;
}
const Index = z.coerce.number().int().min(0).max(30);
const seatNumbers = (capacity: number) => z.array(z.number().int().min(1).max(capacity)).max(capacity).refine(v => new Set(v).size === v.length, "Do not select the same place twice.").default([]);
const Selection = z.object({ seats: seatNumbers(19), standing: seatNumbers(10), requestId: z.string().min(10).max(100) });
const BookingBody = Selection.extend({ runId: z.number().int().positive(), pickupIndex: z.number().int().min(0), dropoffIndex: z.number().int().positive() }).refine(b => b.seats.length + b.standing.length > 0, "Choose at least one place.");
const WalkInBody = Selection.extend({ dropoffIndex: z.number().int().positive() }).refine(b => b.seats.length + b.standing.length > 0, "Choose at least one place.");

router.get("/fixed-loop/service", requireAuth, safe(async (_req, res) => { res.json(await serviceResponse()); }));

router.get("/fixed-loop/runs", requireAuth, safe(async (req, res) => {
  const row = await loadService();
  if (!published(row) || !row) { res.json({ runs: [] }); return; }
  const date = typeof req.query.date === "string" ? req.query.date : manilaDate();
  await ensureRuns(row.service, date);
  const departures = await db.select().from(runs).where(and(eq(runs.serviceId, row.service.id), eq(runs.serviceDate, date))).orderBy(asc(runs.departureAt));
  res.json({ runs: departures.map(runResponse) });
}));

router.get("/fixed-loop/runs/:id/availability", requireAuth, safe(async (req, res) => {
  const run = await getRun(idParam(req.params.id));
  const query = z.object({ pickupIndex: Index.default(0), dropoffIndex: Index.default(run.stops.length - 1) }).safeParse(req.query);
  if (!query.success) throw new FixedLoopError(400, "Choose valid pickup and drop-off stops.");
  const service = await loadService();
  if (!published(service) || service?.service.id !== run.serviceId) throw new FixedLoopError(409, "This service is unavailable.");
  res.json({ run: runResponse(run), pickupIndex: query.data.pickupIndex, dropoffIndex: query.data.dropoffIndex, ...await availablePlaces(db, run, query.data.pickupIndex, query.data.dropoffIndex) });
}));

router.post("/fixed-loop/reservations", requireAuth, requireRole("passenger"), sensitiveActionLimiter, safe(async (req, res) => {
  const body = BookingBody.safeParse(req.body);
  if (!body.success) throw new FixedLoopError(400, body.error.issues[0]?.message ?? "Invalid reservation.");
  const reservation = await db.transaction(async tx => {
    const run = await lockRun(tx, body.data.runId);
    return allocate(tx, run, req.user.id, body.data, "app");
  });
  res.status(201).json({ reservation });
}));

router.get("/fixed-loop/reservations", requireAuth, safe(async (req, res) => {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const rows = await db.select({ reservation: reservations, run: runs }).from(reservations)
    .innerJoin(runs, eq(reservations.runId, runs.id)).where(eq(reservations.passengerId, req.user.id))
    .orderBy(desc(reservations.createdAt), desc(reservations.id)).limit(limit).offset(offset);
  const allocations = rows.length ? await db.select().from(places).where(inArray(places.reservationId, rows.map(row=>row.reservation.id))) : [];
  res.json({ reservations: rows.map(row=>ticketResponse(row.reservation, row.run, allocations.filter(p=>p.reservationId===row.reservation.id))), limit, offset });
}));

router.get("/fixed-loop/reservations/:id", requireAuth, safe(async (req, res) => {
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, idParam(req.params.id)));
  if (!reservation) throw new FixedLoopError(404, "Reservation not found.");
  const run = await getRun(reservation.runId);
  if (reservation.passengerId !== req.user.id) await requireOperator(req.user, run);
  const allocations = await db.select().from(places).where(eq(places.reservationId, reservation.id));
  res.json({ reservation: ticketResponse(reservation, run, allocations) });
}));

router.post("/fixed-loop/reservations/:id/cancel", requireAuth, safe(async (req, res) => {
  const id = idParam(req.params.id);
  const [original] = await db.select().from(reservations).where(eq(reservations.id, id));
  if (!original || original.passengerId !== req.user.id) throw new FixedLoopError(404, "Reservation not found.");
  const result = await db.transaction(async tx => {
    const run = await lockRun(tx, original.runId);
    const [reservation] = await tx.select().from(reservations).where(eq(reservations.id, id));
    if (!reservation) throw new FixedLoopError(404, "Reservation not found.");
    if (reservation.status !== "cancelled") {
      if (reservation.status !== "confirmed" || !runResponse(run).bookingOpen) throw new FixedLoopError(409, "This reservation can no longer be cancelled in the app. Contact the operator.");
      await releaseReservation(tx, id, "cancelled");
      await tx.insert(auditLogsTable).values({ actorUserId: req.user.id, action: "fixed_loop.cancelled", metadata: { reservationId: id, runId: run.id } });
    }
    const allocations = await tx.select().from(places).where(eq(places.reservationId, id));
    return ticketResponse({ ...reservation, status: "cancelled" }, run, allocations);
  });
  res.json({ reservation: result });
}));

router.get("/fixed-loop/operator/runs", requireAuth, requireRole("driver", "admin"), safe(async (req, res) => {
  const row = await loadService();
  if (!row || (req.user.role === "driver" && row.driverId !== req.user.id)) { res.json({ service: null, runs: [] }); return; }
  const date = typeof req.query.date === "string" ? req.query.date : manilaDate();
  await ensureRuns(row.service, date);
  const departures = await db.select().from(runs).where(and(eq(runs.serviceId, row.service.id), eq(runs.serviceDate, date))).orderBy(asc(runs.departureAt));
  res.json({ service: { id: row.service.id, name: row.service.name, unitLabel: row.service.unitLabel, enabled: row.service.enabled }, runs: departures.map(runResponse) });
}));

router.get("/fixed-loop/runs/:id/manifest", requireAuth, requireRole("driver", "admin"), safe(async (req, res) => {
  const run = await getRun(idParam(req.params.id));
  await requireOperator(req.user, run);
  res.setHeader("Cache-Control", "no-store");
  res.json({ run: runResponse(run), reservations: await reservationsForRun(run) });
}));

router.post("/fixed-loop/runs/:id/walk-ins", requireAuth, requireRole("driver", "admin"), sensitiveActionLimiter, safe(async (req, res) => {
  const run = await getRun(idParam(req.params.id));
  await requireOperator(req.user, run);
  const body = WalkInBody.safeParse(req.body);
  if (!body.success) throw new FixedLoopError(400, body.error.issues[0]?.message ?? "Invalid places.");
  const reservation = await db.transaction(async tx => {
    const current = await lockRun(tx, run.id);
    return allocate(tx, current, req.user.id, { ...body.data, pickupIndex: current.currentStopIndex }, "walk_in");
  });
  res.status(201).json({ reservation });
}));

router.post("/fixed-loop/reservations/:id/check-in", requireAuth, requireRole("driver", "admin"), safe(async (req, res) => {
  const body = z.object({ action: z.enum(["board", "no_show"]) }).safeParse(req.body);
  if (!body.success) throw new FixedLoopError(400, "Choose board or no-show.");
  const [original] = await db.select().from(reservations).where(eq(reservations.id, idParam(req.params.id)));
  if (!original) throw new FixedLoopError(404, "Reservation not found.");
  const run = await getRun(original.runId);
  await requireOperator(req.user, run);
  const result = await db.transaction(async tx => {
    const current = await lockRun(tx, run.id);
    const [reservation] = await tx.select().from(reservations).where(eq(reservations.id, original.id));
    if (!reservation || reservation.status !== "confirmed" || !["boarding", "on_route"].includes(current.status)) throw new FixedLoopError(409, "This reservation is not awaiting boarding on an active run.");
    if (body.data.action === "board") {
      if (reservation.pickupIndex !== current.currentStopIndex) throw new FixedLoopError(409, "Board this reservation at its selected pickup stop.");
      await tx.update(reservations).set({ status: "boarded" }).where(eq(reservations.id, reservation.id));
    } else {
      if (current.status !== "on_route" || reservation.pickupIndex > current.currentStopIndex) throw new FixedLoopError(409, "A no-show can only be confirmed after departure at the pickup stop.");
      await releaseReservation(tx, reservation.id, "no_show");
    }
    await tx.insert(auditLogsTable).values({ actorUserId: req.user.id, action: body.data.action === "board" ? "fixed_loop.boarded" : "fixed_loop.no_show", metadata: { reservationId: reservation.id, runId: current.id } });
    const allocations = await tx.select().from(places).where(eq(places.reservationId, reservation.id));
    return ticketResponse({ ...reservation, status: body.data.action === "board" ? "boarded" : "no_show" }, current, allocations);
  });
  res.json({ reservation: result });
}));

router.post("/fixed-loop/runs/:id/control", requireAuth, requireRole("driver", "admin"), safe(async (req, res) => {
  const run = await getRun(idParam(req.params.id));
  await requireOperator(req.user, run);
  const body = z.object({ action: z.enum(["boarding", "start", "next_stop", "cancel"]), expectedStopIndex: z.number().int().min(0).optional(), confirmAlighted: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) throw new FixedLoopError(400, "Invalid run action.");
  const cancelledPassengers: string[] = [];
  const updated = await db.transaction(async tx => {
    // Serialize lifecycle changes across this one vehicle before locking its run.
    const [service] = await tx.select().from(services).where(eq(services.id, run.serviceId)).for("update");
    const current = await lockRun(tx, run.id);
    const action = body.data.action;
    if (action === "cancel") {
      if (current.status === "cancelled") return current;
      if (current.status === "completed") throw new FixedLoopError(409, "A completed run cannot be cancelled.");
      const active = await tx.select().from(reservations).where(and(eq(reservations.runId, current.id), inArray(reservations.status, ["confirmed", "boarded"])));
      if (active.some(r=>r.status === "boarded") && !body.data.confirmAlighted) throw new FixedLoopError(409, "Confirm that all onboard passengers have alighted before cancelling this run.");
      cancelledPassengers.push(...active.flatMap(r=>r.passengerId ? [r.passengerId] : []));
      for (const reservation of active) await releaseReservation(tx, reservation.id, "cancelled");
      const [cancelled] = await tx.update(runs).set({ status: "cancelled", endedAt: new Date() }).where(eq(runs.id, current.id)).returning();
      if (["boarding", "on_route"].includes(current.status)) await tx.update(loopVehiclesTable).set({ status: "idle", updatedAt: new Date() }).where(eq(loopVehiclesTable.id, current.vehicleId));
      await tx.insert(auditLogsTable).values({ actorUserId: req.user.id, action: "fixed_loop.run_cancelled", metadata: { runId: current.id } });
      return cancelled!;
    }
    if (!service?.enabled || ["cancelled", "completed"].includes(current.status)) throw new FixedLoopError(409, "This run is unavailable.");
    if (action === "boarding" || action === "start") {
      if (current.serviceDate !== manilaDate() || Date.now() < current.departureAt.getTime() - 30 * 60_000) throw new FixedLoopError(409, "Open boarding within 30 minutes of this departure on its scheduled date.");
      if (action === "start" && Date.now() < current.departureAt.getTime()) throw new FixedLoopError(409, "Wait until the published departure time before starting.");
      if (current.status === "on_route" && action === "boarding") throw new FixedLoopError(409, "The run has already departed.");
      const status = action === "boarding" ? "boarding" : "on_route";
      const [saved] = await tx.update(runs).set({ status, ...(action === "start" ? { startedAt: current.startedAt ?? new Date() } : {}) }).where(eq(runs.id, current.id)).returning();
      await tx.update(loopVehiclesTable).set({ status: status === "on_route" ? "on_route" : "idle", updatedAt: new Date() }).where(eq(loopVehiclesTable.id, current.vehicleId));
      await tx.insert(auditLogsTable).values({ actorUserId: req.user.id, action: `fixed_loop.${action}`, metadata: { runId: current.id } });
      return saved!;
    }
    if (current.status !== "on_route" || body.data.expectedStopIndex !== current.currentStopIndex) throw new FixedLoopError(409, "The current stop changed. Refresh the manifest before advancing.");
    const waiting = await tx.select().from(reservations).where(and(eq(reservations.runId, current.id), eq(reservations.status, "confirmed")));
    if (waiting.some(r=>r.pickupIndex <= current.currentStopIndex)) throw new FixedLoopError(409, "Confirm boarding or no-show for passengers at this stop before advancing.");
    const next = current.currentStopIndex + 1;
    if (next >= current.stops.length) throw new FixedLoopError(409, "The last stop has already been reached.");
    const boarded = await tx.select().from(reservations).where(and(eq(reservations.runId, current.id), eq(reservations.status, "boarded")));
    for (const reservation of boarded.filter(r=>r.dropoffIndex <= next)) await releaseReservation(tx, reservation.id, "completed");
    const completed = next === current.stops.length - 1;
    const [saved] = await tx.update(runs).set({ currentStopIndex: next, ...(completed ? { status: "completed", endedAt: new Date() } : {}) }).where(eq(runs.id, current.id)).returning();
    if (completed) await tx.update(loopVehiclesTable).set({ status: "idle", updatedAt: new Date() }).where(eq(loopVehiclesTable.id, current.vehicleId));
    await tx.insert(auditLogsTable).values({ actorUserId: req.user.id, action: completed ? "fixed_loop.completed" : "fixed_loop.stop_confirmed", metadata: { runId: current.id, stopIndex: next } });
    return saved!;
  });
  for (const userId of new Set(cancelledPassengers)) {
    void sendPushToUser(userId, { title: "E-jeep departure cancelled", body: `${run.unitLabel}: your scheduled departure was cancelled. Open your reservation for details.`, data: { type: "fixed_loop_cancelled", runId: run.id } }).catch(error => req.log.warn({ error }, "Fixed-loop cancellation notification failed"));
  }
  res.json({ run: runResponse(updated) });
}));

export default router;
