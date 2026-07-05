import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { parseIdParam, parsePagination } from "../lib/http";
import { z } from "zod";

const router: IRouter = Router();

/**
 * GET /api/subscriptions/me
 */
router.get("/subscriptions/me", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, authReq.user.id))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  res.json({ subscription: subscription ?? null });
});

/**
 * GET /api/subscriptions  (admin)
 */
router.get(
  "/subscriptions",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const statusFilter = req.query.status as string | undefined;

    const subs = await db
      .select()
      .from(subscriptionsTable)
      .where(statusFilter ? eq(subscriptionsTable.status, statusFilter) : undefined)
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ subscriptions: subs, limit, offset });
  },
);

/**
 * POST /api/subscriptions  (admin)
 */
const CreateSubBody = z.object({
  userId: z.string().uuid(),
  plan: z.string().default("annual"),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

router.post(
  "/subscriptions",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateSubBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const now = new Date();
    const expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    const [sub] = await db
      .insert(subscriptionsTable)
      .values({
        userId: parsed.data.userId,
        plan: parsed.data.plan,
        status: "active",
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : now,
        expiresAt,
      })
      .returning();

    res.status(201).json({ subscription: sub });
  },
);

/**
 * PATCH /api/subscriptions/:id  (admin)
 */
const UpdateSubBody = z.object({
  status: z.enum(["active", "expired", "cancelled"]),
});

router.patch(
  "/subscriptions/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const subId = parseIdParam(req.params.id);
    if (subId === null) {
      res.status(400).json({ error: "Invalid subscription ID" });
      return;
    }

    const parsed = UpdateSubBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [sub] = await db
      .update(subscriptionsTable)
      .set({ status: parsed.data.status })
      .where(eq(subscriptionsTable.id, subId))
      .returning();

    if (!sub) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    res.json({ subscription: sub });
  },
);

export default router;
