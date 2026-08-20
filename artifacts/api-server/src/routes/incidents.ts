import { Router, type IRouter } from "express";
import { and, eq, desc, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogsTable, incidentReportsTable, tripsTable, usersTable } from "@workspace/db";
import { hasProvincialAdminAccess, requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { parseIdParam, parsePagination } from "../lib/http";
import { sendPushToUser } from "../lib/push";
import { z } from "zod";

const router: IRouter = Router();

const CreateIncidentBody = z.object({
  type: z.enum(["accident", "flood", "fleet_issue"]),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().trim().max(2000).optional(),
  photoUrl: z.string().url().optional(),
  tripId: z.number().int().positive().optional(),
});

/**
 * POST /api/incidents
 */
router.post("/incidents", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const parsed = CreateIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.tripId) {
    const [trip] = await db
      .select({ passengerId: tripsTable.passengerId, driverId: tripsTable.driverId })
      .from(tripsTable)
      .where(eq(tripsTable.id, parsed.data.tripId));
    if (
      !trip ||
      (trip.passengerId !== authReq.user.id &&
        trip.driverId !== authReq.user.id &&
        authReq.user.role !== "admin" &&
        authReq.user.role !== "superadmin")
    ) {
      res.status(403).json({ error: "This incident cannot be linked to that trip" });
      return;
    }
  }

  const report = await db.transaction(async (trx) => {
    const [created] = await trx
      .insert(incidentReportsTable)
      .values({ reporterId: authReq.user.id, ...parsed.data })
      .returning();
    await trx.insert(auditLogsTable).values({
      actorUserId: authReq.user.id,
      action: "incident.reported",
      metadata: {
        incidentId: created!.id,
        severity: created!.severity,
        type: created!.type,
        tripId: created!.tripId,
      },
    });
    return created!;
  });

  if (["high", "critical"].includes(report.severity)) {
    const staff = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          inArray(usersTable.role, ["admin", "superadmin"]),
          eq(usersTable.isActive, true),
        ),
      );
    for (const member of staff) {
      void sendPushToUser(member.id, {
        title: `${report.severity === "critical" ? "Critical" : "High-priority"} incident`,
        body: `${report.type.replace("_", " ")} reported${report.tripId ? ` on trip #${report.tripId}` : ""}.`,
        data: { type: "incident", incidentId: report.id },
      });
    }
  }

  req.log.info({ reportId: report.id, type: report.type, severity: report.severity }, "Incident reported");
  res.status(201).json({ report });
});

/**
 * GET /api/incidents
 */
router.get("/incidents", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  const isAdmin = hasProvincialAdminAccess(authReq.user.role);

  const reports = isAdmin
    ? await db
        .select()
        .from(incidentReportsTable)
        .orderBy(desc(incidentReportsTable.createdAt))
        .limit(limit)
        .offset(offset)
    : await db
        .select()
        .from(incidentReportsTable)
        .where(eq(incidentReportsTable.reporterId, authReq.user.id))
        .orderBy(desc(incidentReportsTable.createdAt))
        .limit(limit)
        .offset(offset);

  res.json({ reports, limit, offset });
});

/**
 * GET /api/incidents/:id
 */
router.get("/incidents/:id", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const incidentId = parseIdParam(req.params.id);
  if (incidentId === null) {
    res.status(400).json({ error: "Invalid incident ID" });
    return;
  }

  const [report] = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.id, incidentId));

  if (!report) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  const isOwner = report.reporterId === authReq.user.id;
  if (!isOwner && !hasProvincialAdminAccess(authReq.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json({ report });
});

/**
 * PATCH /api/incidents/:id  (admin only)
 */
const UpdateIncidentBody = z.object({
  status: z.enum(["reviewing", "resolved"]),
});

router.patch(
  "/incidents/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const incidentId = parseIdParam(req.params.id);
    if (incidentId === null) {
      res.status(400).json({ error: "Invalid incident ID" });
      return;
    }

    const parsed = UpdateIncidentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const report = await db.transaction(async (trx) => {
      const [existing] = await trx
        .select()
        .from(incidentReportsTable)
        .where(eq(incidentReportsTable.id, incidentId))
        .for("update");
      if (!existing) return null;
      const [updated] = await trx
        .update(incidentReportsTable)
        .set({
          status: parsed.data.status,
          resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
          resolvedBy: parsed.data.status === "resolved" ? authReq.user.id : null,
        })
        .where(eq(incidentReportsTable.id, incidentId))
        .returning();
      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        targetUserId: existing.reporterId,
        action: "incident.status_changed",
        metadata: {
          incidentId,
          previousStatus: existing.status,
          newStatus: parsed.data.status,
        },
      });
      return updated!;
    });

    if (!report) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }

    res.json({ report });
  },
);

export default router;
