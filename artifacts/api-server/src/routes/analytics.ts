import { Router, type IRouter } from "express";
import { sql, eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { tripsTable, fareTransactionsTable, incidentReportsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parsePagination, parseDateRange } from "../lib/http";

const router: IRouter = Router();

/**
 * GET /api/analytics/daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get(
  "/analytics/daily",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { startDate, endDate } = parseDateRange(req.query);

    const dailyTrips = await db
      .select({
        date: sql<string>`date_trunc('day', ${tripsTable.createdAt})::date`,
        tripCount: sql<number>`count(*)::int`,
        completedCount: sql<number>`count(*) filter (where ${tripsTable.status} = 'completed')::int`,
        cancelledCount: sql<number>`count(*) filter (where ${tripsTable.status} = 'cancelled')::int`,
        uniquePassengers: sql<number>`count(distinct ${tripsTable.passengerId})::int`,
        totalFareCollected: sql<number>`coalesce(sum(${tripsTable.fareAmount}) filter (where ${tripsTable.status} = 'completed'), 0)`,
        avgTripDurationMinutes: sql<number>`
          coalesce(avg(
            extract(epoch from (${tripsTable.completedAt} - ${tripsTable.startedAt})) / 60
          ) filter (where ${tripsTable.status} = 'completed'), 0)
        `,
      })
      .from(tripsTable)
      .where(
        and(
          gte(tripsTable.createdAt, new Date(startDate)),
          lte(tripsTable.createdAt, new Date(endDate + "T23:59:59Z")),
        ),
      )
      .groupBy(sql`date_trunc('day', ${tripsTable.createdAt})::date`)
      .orderBy(sql`date_trunc('day', ${tripsTable.createdAt})::date`);

    res.json({ dailyTrips, startDate, endDate });
  },
);

/**
 * GET /api/analytics/summary
 */
router.get(
  "/analytics/summary",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const [tripStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${tripsTable.status} = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where ${tripsTable.status} = 'cancelled')::int`,
        inProgress: sql<number>`count(*) filter (where ${tripsTable.status} = 'in_progress')::int`,
        totalRevenue: sql<number>`coalesce(sum(${tripsTable.fareAmount}) filter (where ${tripsTable.status} = 'completed'), 0)`,
      })
      .from(tripsTable);

    const [userStats] = await db
      .select({
        totalUsers: sql<number>`count(*)::int`,
        passengers: sql<number>`count(*) filter (where ${usersTable.role} = 'passenger')::int`,
        drivers: sql<number>`count(*) filter (where ${usersTable.role} = 'driver')::int`,
        admins: sql<number>`count(*) filter (where ${usersTable.role} = 'admin')::int`,
      })
      .from(usersTable);

    const [incidentStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${incidentReportsTable.status} = 'open')::int`,
        accidents: sql<number>`count(*) filter (where ${incidentReportsTable.type} = 'accident')::int`,
        floods: sql<number>`count(*) filter (where ${incidentReportsTable.type} = 'flood')::int`,
      })
      .from(incidentReportsTable);

    res.json({ trips: tripStats, users: userStats, incidents: incidentStats });
  },
);

/**
 * GET /api/analytics/trips
 */
router.get(
  "/analytics/trips",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const statusFilter = req.query.status as string | undefined;
    const driverIdFilter = req.query.driverId as string | undefined;
    const passengerIdFilter = req.query.passengerId as string | undefined;

    const filters = [];
    if (statusFilter) filters.push(eq(tripsTable.status, statusFilter));
    if (driverIdFilter) filters.push(eq(tripsTable.driverId, driverIdFilter));
    if (passengerIdFilter) filters.push(eq(tripsTable.passengerId, passengerIdFilter));

    const trips = await db
      .select()
      .from(tripsTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(tripsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ trips, limit, offset });
  },
);

/**
 * GET /api/analytics/earnings
 */
router.get("/analytics/earnings", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as import("../middlewares/auth").AuthenticatedRequest;

  const driverId =
    authReq.user.role === "admin" && req.query.driverId
      ? String(req.query.driverId)
      : authReq.user.id;

  const { startDate, endDate } = parseDateRange(req.query);

  const earnings = await db
    .select({
      date: sql<string>`date_trunc('day', ${tripsTable.completedAt})::date`,
      tripCount: sql<number>`count(*)::int`,
      totalEarnings: sql<number>`coalesce(sum(${tripsTable.fareAmount}), 0)`,
      avgFare: sql<number>`coalesce(avg(${tripsTable.fareAmount}), 0)`,
    })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.driverId, driverId),
        eq(tripsTable.status, "completed"),
        gte(tripsTable.completedAt, new Date(startDate)),
        lte(tripsTable.completedAt, new Date(endDate + "T23:59:59Z")),
      ),
    )
    .groupBy(sql`date_trunc('day', ${tripsTable.completedAt})::date`)
    .orderBy(sql`date_trunc('day', ${tripsTable.completedAt})::date`);

  res.json({ earnings, driverId, startDate, endDate });
});

export default router;
