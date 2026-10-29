import { Router, type IRouter } from "express";
import { desc, eq, getTableColumns } from "drizzle-orm";
import { appFeedbackTable, auditLogsTable, db, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { parseIdParam, parsePagination } from "../lib/http";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { z } from "zod";

const router: IRouter = Router();
const CreateFeedbackBody = z.object({
  category: z.enum(["bug", "suggestion", "other"]),
  message: z.string().trim().refine(value => Array.from(value).length >= 10 && Array.from(value).length <= 2000),
  appVersion: z.string().trim().min(1).max(40).optional(),
  platform: z.enum(["android", "ios", "web"]).optional(),
});
const FeedbackStatus = z.enum(["open", "reviewing", "resolved"]);

router.post("/feedback", requireAuth, sensitiveActionLimiter, async (req, res): Promise<void> => {
  const parsed = CreateFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a feedback type and enter a message of 10 to 2,000 characters." });
    return;
  }
  const userId = (req as AuthenticatedRequest).user.id;
  const feedback = await db.transaction(async (tx) => {
    const [created] = await tx.insert(appFeedbackTable).values({ reporterId: userId, ...parsed.data }).returning();
    await tx.insert(auditLogsTable).values({
      actorUserId: userId,
      action: "feedback.created",
      metadata: { feedbackId: created!.id, category: created!.category },
    });
    return created!;
  });
  res.status(201).json({ feedback });
});

router.get("/feedback", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const status = FeedbackStatus.optional().safeParse(req.query.status);
  if (!status.success) {
    res.status(400).json({ error: "Invalid feedback status" });
    return;
  }
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
  const feedback = await db.select({
    ...getTableColumns(appFeedbackTable),
    reporterName: usersTable.fullName,
    reporterEmail: usersTable.email,
  }).from(appFeedbackTable)
    .leftJoin(usersTable, eq(appFeedbackTable.reporterId, usersTable.id))
    .where(status.data ? eq(appFeedbackTable.status, status.data) : undefined)
    .orderBy(desc(appFeedbackTable.createdAt), desc(appFeedbackTable.id))
    .limit(limit).offset(offset);
  res.setHeader("Cache-Control", "no-store");
  res.json({ feedback, limit, offset });
});

router.patch("/feedback/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseIdParam(req.params.id);
  const parsed = z.object({ status: FeedbackStatus }).safeParse(req.body);
  if (id === null || !parsed.success) {
    res.status(400).json({ error: "Invalid feedback ID or status" });
    return;
  }
  const actorId = (req as AuthenticatedRequest).user.id;
  const feedback = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(appFeedbackTable).where(eq(appFeedbackTable.id, id)).for("update");
    if (!existing) return null;
    const [updated] = await tx.update(appFeedbackTable).set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(appFeedbackTable.id, id)).returning();
    await tx.insert(auditLogsTable).values({
      actorUserId: actorId,
      targetUserId: existing.reporterId,
      action: "feedback.status_changed",
      metadata: { feedbackId: id, previousStatus: existing.status, newStatus: parsed.data.status },
    });
    return updated!;
  });
  if (!feedback) {
    res.status(404).json({ error: "Feedback not found" });
    return;
  }
  res.json({ feedback });
});

export default router;
