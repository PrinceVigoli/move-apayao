import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { incidentReportsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { parseIdParam, parsePagination } from "../lib/http";
import { z } from "zod";

const router: IRouter = Router();

const CreateIncidentBody = z.object({
  type: z.enum(["accident", "flood", "fleet_issue"]),
  lat: z.number(),
  lon: z.number(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().optional(),
  photoUrl: z.string().url().optional(),
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

  const [report] = await db
    .insert(incidentReportsTable)
    .values({
      reporterId: authReq.user.id,
      ...parsed.data,
    })
    .returning();

  req.log.info({ reportId: report.id, type: report.type, severity: report.severity }, "Incident reported");
  res.status(201).json({ report });
});

/**
 * GET /api/incidents
 */
router.get("/incidents", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  const isAdmin = authReq.user.role === "admin";

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
  if (!isOwner && authReq.user.role !== "admin") {
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

    const [report] = await db
      .update(incidentReportsTable)
      .set({
        status: parsed.data.status,
        resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
        resolvedBy: parsed.data.status === "resolved" ? authReq.user.id : null,
      })
      .where(eq(incidentReportsTable.id, incidentId))
      .returning();

    if (!report) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }

    res.json({ report });
  },
);

export default router;
