import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parsePagination } from "../lib/http";

const router: IRouter = Router();

/**
 * GET /api/audit-logs
 * Admin-only. Sensitive/financial admin actions (wallet top-ups, refunds),
 * newest first.
 */
router.get(
  "/audit-logs",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { limit, offset } = parsePagination(req.query);

    const logs = await db
      .select({
        id: auditLogsTable.id,
        action: auditLogsTable.action,
        amount: auditLogsTable.amount,
        metadata: auditLogsTable.metadata,
        createdAt: auditLogsTable.createdAt,
        actorId: auditLogsTable.actorUserId,
        actorEmail: usersTable.email,
        targetUserId: auditLogsTable.targetUserId,
      })
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(auditLogsTable.actorUserId, usersTable.id))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs, limit, offset });
  },
);

export default router;