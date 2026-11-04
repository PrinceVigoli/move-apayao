import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  fixedLoopReservationsTable as reservations,
  usersTable,
} from "@workspace/db";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../middlewares/auth";
import { getRun, requireOperator, FixedLoopError } from "../lib/fixed-loop";
import { getRedis } from "../lib/redis";
import { parseIdParam } from "../lib/http";
import {
  canSharePickupLocation,
  PassengerPoint,
  recentPassengerPoint,
  passengerLocationKey,
  PASSENGER_LOCATION_TTL,
  UPDATE_PASSENGER_LOCATION,
  STOP_PASSENGER_LOCATION,
} from "../lib/passenger-sharing";

const router = Router();
router.use("/fixed-loop", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const base = "/fixed-loop/reservations/:id/location-sharing";

router.post(base, requireAuth, requireRole("passenger"), async (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const id = parseIdParam(req.params.id as string);
  const point = PassengerPoint.safeParse(req.body);
  if (
    id === null ||
    !point.success ||
    !recentPassengerPoint(point.data.capturedAt)
  ) {
    res.status(400).json({ error: "A recent GPS fix is required." });
    return;
  }
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.passengerId, user.id)));
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  const run = await getRun(reservation.runId);
  if (!canSharePickupLocation(reservation, run)) {
    res
      .status(409)
      .json({
        error:
          "Location sharing is available from one hour before departure until boarding or your pickup stop is passed.",
      });
    return;
  }
  if (!process.env.REDIS_URL) {
    res
      .status(503)
      .json({ error: "Location sharing is temporarily unavailable." });
    return;
  }
  const sharingId = randomUUID();
  await getRedis().set(
    passengerLocationKey(id),
    JSON.stringify({ ...point.data, sharingId }),
    "EX",
    PASSENGER_LOCATION_TTL,
  );
  res.status(201).json({ sharingId });
});

router.put(base, requireAuth, requireRole("passenger"), async (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const id = parseIdParam(req.params.id as string);
  const point = PassengerPoint.extend({
    sharingId: z.string().uuid(),
  }).safeParse(req.body);
  if (
    id === null ||
    !point.success ||
    !recentPassengerPoint(point.data.capturedAt)
  ) {
    res.status(400).json({ error: "A recent GPS fix is required." });
    return;
  }
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.passengerId, user.id)));
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  const run = await getRun(reservation.runId);
  if (!canSharePickupLocation(reservation, run)) {
    await getRedis().del(passengerLocationKey(id));
    res
      .status(409)
      .json({ error: "Location sharing has ended for this reservation." });
    return;
  }
  const updated = await getRedis().eval(
    UPDATE_PASSENGER_LOCATION,
    1,
    passengerLocationKey(id),
    point.data.sharingId,
    JSON.stringify(point.data),
    PASSENGER_LOCATION_TTL,
  );
  if (updated !== 1) {
    res
      .status(409)
      .json({
        error: "Location sharing has stopped. Start sharing again if needed.",
      });
    return;
  }
  res.json({ sharing: true });
});

router.delete(base, requireAuth, requireRole("passenger"), async (req, res) => {
  const id = parseIdParam(req.params.id as string);
  const body = z.object({ sharingId: z.string().uuid() }).safeParse(req.body);
  if (id === null || !body.success) {
    res.status(400).json({ error: "Invalid sharing session." });
    return;
  }
  const [reservation] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.id, id),
        eq(reservations.passengerId, (req as AuthenticatedRequest).user.id),
      ),
    );
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  await getRedis().eval(
    STOP_PASSENGER_LOCATION,
    1,
    passengerLocationKey(id),
    body.data.sharingId,
  );
  res.json({ sharing: false });
});

router.get(
  "/fixed-loop/runs/:id/passenger-locations",
  requireAuth,
  requireRole("driver"),
  async (req, res) => {
    const id = parseIdParam(req.params.id as string);
    if (id === null) {
      res.status(400).json({ error: "Invalid run." });
      return;
    }
    const run = await getRun(id);
    await requireOperator((req as AuthenticatedRequest).user, run);
    const rows = await db
      .select({
        reservation: reservations,
        name: usersTable.fullName,
        avatar: usersTable.avatarUrl,
        updatedAt: usersTable.updatedAt,
      })
      .from(reservations)
      .innerJoin(usersTable, eq(reservations.passengerId, usersTable.id))
      .where(
        and(
          eq(reservations.runId, id),
          eq(reservations.status, "confirmed"),
          eq(usersTable.isActive, true),
        ),
      );
    const eligible = rows.filter((row) =>
      canSharePickupLocation(row.reservation, run),
    );
    const points = eligible.length
      ? await getRedis().mget(
          ...eligible.map((row) => passengerLocationKey(row.reservation.id)),
        )
      : [];
    res.json({
      passengers: eligible.flatMap((row, i) => {
        try {
          if (!points[i]) return [];
          const point = PassengerPoint.safeParse(JSON.parse(points[i]!));
          if (!point.success || !recentPassengerPoint(point.data.capturedAt))
            return [];
          return [
            {
              reservationId: row.reservation.id,
              name: row.name || "Passenger",
              hasAvatar: !!row.avatar,
              avatarVersion: row.updatedAt.toISOString(),
              pickupName:
                run.stops[row.reservation.pickupIndex]?.name ?? "Pickup stop",
              ...point.data,
            },
          ];
        } catch {
          return [];
        }
      }),
    });
  },
);

router.get(
  "/fixed-loop/reservations/:id/passenger-avatar",
  requireAuth,
  requireRole("driver"),
  async (req, res) => {
    const id = parseIdParam(req.params.id as string);
    if (id === null) {
      res.status(400).json({ error: "Invalid reservation." });
      return;
    }
    const [row] = await db
      .select({ reservation: reservations, avatarUrl: usersTable.avatarUrl })
      .from(reservations)
      .innerJoin(usersTable, eq(reservations.passengerId, usersTable.id))
      .where(and(eq(reservations.id, id), eq(usersTable.isActive, true)));
    if (!row) {
      res.status(404).json({ error: "Reservation not found." });
      return;
    }
    const run = await getRun(row.reservation.runId);
    await requireOperator((req as AuthenticatedRequest).user, run);
    if (
      !canSharePickupLocation(row.reservation, run) ||
      !(await getRedis().get(passengerLocationKey(id)))
    ) {
      res
        .status(404)
        .json({ error: "Passenger is not sharing their pickup location." });
      return;
    }
    res.json({ avatarUrl: row.avatarUrl });
  },
);

router.use(
  (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof FixedLoopError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  },
);
export default router;
