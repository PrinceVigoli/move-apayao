import { Router, type IRouter } from "express";
import { and, eq, desc, lte, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogsTable, subscriptionsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { parseIdParam, parsePagination } from "../lib/http";
import { z } from "zod";

const router: IRouter = Router();

/**
 * GET /api/subscriptions/me
 */
router.get("/subscriptions/me", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

  await db
    .update(subscriptionsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(subscriptionsTable.userId, authReq.user.id),
        eq(subscriptionsTable.status, "active"),
        lte(subscriptionsTable.expiresAt, new Date()),
      ),
    );

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
    const parsedStatus = z.enum(["active", "expired", "cancelled"]).optional().safeParse(req.query.status);
    if (!parsedStatus.success) {
      res.status(400).json({ error: "Invalid subscription status" });
      return;
    }
    const statusFilter = parsedStatus.data;

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
  plan: z.enum(["annual", "basic_weekly", "premium_monthly", "premium_yearly"]).default("annual"),
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

    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
    const expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : defaultExpiry(startsAt, parsed.data.plan);
    if (expiresAt <= startsAt) {
      res.status(400).json({ error: "Subscription expiry must be after its start date" });
      return;
    }

    const sub = await db.transaction(async (trx) => {
      const [target] = await trx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, parsed.data.userId))
        .for("update");
      if (!target) return null;
      await trx
        .update(subscriptionsTable)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(subscriptionsTable.userId, parsed.data.userId),
            eq(subscriptionsTable.status, "active"),
          ),
        );
      const [created] = await trx
        .insert(subscriptionsTable)
        .values({
          userId: parsed.data.userId,
          plan: parsed.data.plan,
          status: "active",
          startsAt,
          expiresAt,
        })
        .returning();
      await trx.insert(auditLogsTable).values({
        actorUserId: (req as AuthenticatedRequest).user.id,
        targetUserId: parsed.data.userId,
        action: "subscription.created",
        metadata: { subscriptionId: created!.id, plan: parsed.data.plan, startsAt, expiresAt },
      });
      return created!;
    });
    if (!sub) {
      res.status(404).json({ error: "Subscription user not found" });
      return;
    }

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

    const sub = await db.transaction(async (trx) => {
      const [existing] = await trx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.id, subId))
        .for("update");
      if (!existing) return null;
      if (parsed.data.status === "active") {
        if (existing.expiresAt <= new Date()) {
          return { kind: "invalid" as const };
        }
        await trx
          .update(subscriptionsTable)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(subscriptionsTable.userId, existing.userId),
              eq(subscriptionsTable.status, "active"),
              ne(subscriptionsTable.id, existing.id),
            ),
          );
      }
      const [updated] = await trx
        .update(subscriptionsTable)
        .set({ status: parsed.data.status })
        .where(eq(subscriptionsTable.id, subId))
        .returning();
      await trx.insert(auditLogsTable).values({
        actorUserId: (req as AuthenticatedRequest).user.id,
        targetUserId: existing.userId,
        action: "subscription.status_changed",
        metadata: {
          subscriptionId: existing.id,
          previousStatus: existing.status,
          newStatus: parsed.data.status,
        },
      });
      return { kind: "updated" as const, subscription: updated! };
    });

    if (!sub) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }
    if (sub.kind === "invalid") {
      res.status(409).json({ error: "An expired subscription cannot be reactivated; create a renewal instead" });
      return;
    }

    res.json({ subscription: sub.subscription });
  },
);

export default router;

function defaultExpiry(start: Date, plan: z.infer<typeof CreateSubBody>["plan"]): Date {
  const expiry = new Date(start);
  if (plan === "basic_weekly") expiry.setUTCDate(expiry.getUTCDate() + 7);
  else if (plan === "premium_monthly") expiry.setUTCMonth(expiry.getUTCMonth() + 1);
  else expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  return expiry;
}
