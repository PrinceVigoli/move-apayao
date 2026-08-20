import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";
import { auditLogsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parsePagination } from "../lib/http";

const router: IRouter = Router();
const actorUsers = alias(usersTable, "audit_actor");
const targetUsers = alias(usersTable, "audit_target");

/**
 * GET /api/audit-logs
 * Admin-only. Security-sensitive and financial administrative actions,
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
        actorEmail: actorUsers.email,
        targetUserId: auditLogsTable.targetUserId,
        targetEmail: targetUsers.email,
        targetName: targetUsers.fullName,
      })
      .from(auditLogsTable)
      .leftJoin(actorUsers, eq(auditLogsTable.actorUserId, actorUsers.id))
      .leftJoin(targetUsers, eq(auditLogsTable.targetUserId, targetUsers.id))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs, limit, offset });
  },
);

export default router;
