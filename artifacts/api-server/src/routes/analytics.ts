import { Router, type IRouter } from "express";
import { sql, eq, and, gte, lt, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { tripsTable, fareTransactionsTable, incidentReportsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parsePagination, parseDateRange } from "../lib/http";
import { hasProvincialAdminAccess, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const REPORTING_TIME_ZONE = process.env.REPORTING_TIME_ZONE ?? "Asia/Manila";
const REPORTING_UTC_OFFSET = process.env.REPORTING_UTC_OFFSET ?? "+08:00";

function reportingRange(startDate: string, endDate: string): { start: Date; endExclusive: Date } {
  const start = new Date(`${startDate}T00:00:00${REPORTING_UTC_OFFSET}`);
  const endStart = new Date(`${endDate}T00:00:00${REPORTING_UTC_OFFSET}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endStart.getTime())) {
    throw new Error("Invalid reporting date range");
  }
  return { start, endExclusive: new Date(endStart.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * GET /api/analytics/daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get(
  "/analytics/daily",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { startDate, endDate } = parseDateRange(req.query);
    const range = reportingRange(startDate, endDate);
    const reportingDay = sql<string>`timezone(${REPORTING_TIME_ZONE}, ${tripsTable.createdAt})::date`;

    const dailyTrips = await db
      .select({
        date: reportingDay,
        tripCount: sql<number>`count(*)::int`,
        completedCount: sql<number>`count(*) filter (where ${tripsTable.status} = 'completed')::int`,
        cancelledCount: sql<number>`count(*) filter (where ${tripsTable.status} = 'cancelled')::int`,
        uniquePassengers: sql<number>`count(distinct ${tripsTable.passengerId})::int`,
        // SOW "passenger count": actual riders moved, not distinct accounts —
        // a group booking of 5 counts as 5. Only completed trips count.
        totalPassengers: sql<number>`coalesce(sum(${tripsTable.passengerCount}) filter (where ${tripsTable.status} = 'completed'), 0)::int`,
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
          gte(tripsTable.createdAt, range.start),
          lt(tripsTable.createdAt, range.endExclusive),
        ),
      )
      .groupBy(reportingDay)
      .orderBy(reportingDay);

    res.json({ dailyTrips, startDate, endDate, reportingTimeZone: REPORTING_TIME_ZONE });
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
    const parsedFilters = z.object({
      status: z.enum(["requested", "matched", "accepted", "arrived", "in_progress", "completed", "cancelled"]).optional(),
      driverId: z.string().uuid().optional(),
      passengerId: z.string().uuid().optional(),
    }).safeParse(req.query);
    if (!parsedFilters.success) {
      res.status(400).json({ error: "Invalid analytics filter" });
      return;
    }
    const { status: statusFilter, driverId: driverIdFilter, passengerId: passengerIdFilter } = parsedFilters.data;

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
router.get("/analytics/earnings", requireAuth, requireRole("driver", "admin"), async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

  const requestedDriverId = z.string().uuid().optional().safeParse(req.query.driverId);
  if (!requestedDriverId.success) {
    res.status(400).json({ error: "Invalid driver ID" });
    return;
  }

  const driverId =
    hasProvincialAdminAccess(authReq.user.role) && requestedDriverId.data
      ? requestedDriverId.data
      : authReq.user.id;

  const { startDate, endDate } = parseDateRange(req.query);
  const range = reportingRange(startDate, endDate);
  const reportingDay = sql<string>`timezone(${REPORTING_TIME_ZONE}, ${tripsTable.completedAt})::date`;

  const earnings = await db
    .select({
      date: reportingDay,
      tripCount: sql<number>`count(*)::int`,
      totalEarnings: sql<number>`coalesce(sum(${tripsTable.fareAmount}), 0)`,
      avgFare: sql<number>`coalesce(avg(${tripsTable.fareAmount}), 0)`,
    })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.driverId, driverId),
        eq(tripsTable.status, "completed"),
        gte(tripsTable.completedAt, range.start),
        lt(tripsTable.completedAt, range.endExclusive),
      ),
    )
    .groupBy(reportingDay)
    .orderBy(reportingDay);

  res.json({ earnings, driverId, startDate, endDate, reportingTimeZone: REPORTING_TIME_ZONE });
});

export default router;
