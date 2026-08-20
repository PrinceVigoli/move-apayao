import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { auditLogsTable, db, farePoliciesTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

export const DEFAULT_FARE_POLICY = {
  id: null,
  name: "Default point-to-point fare",
  baseFare: 40,
  perKmFare: 8,
  minimumFare: 40,
  extraPassengerFare: 10,
  isActive: true,
  createdBy: null,
  createdAt: null,
};

export async function getActiveFarePolicy() {
  const [policy] = await db
    .select()
    .from(farePoliciesTable)
    .where(eq(farePoliciesTable.isActive, true))
    .orderBy(desc(farePoliciesTable.createdAt))
    .limit(1);
  return policy ?? DEFAULT_FARE_POLICY;
}

const FarePolicyBody = z.object({
  name: z.string().trim().min(2).max(100).default("Point-to-point fare"),
  baseFare: z.number().min(0).max(10_000),
  perKmFare: z.number().min(0).max(1_000),
  minimumFare: z.number().min(0).max(10_000),
  extraPassengerFare: z.number().min(0).max(1_000),
});

router.get(
  "/admin/fare-policy",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    res.json({ policy: await getActiveFarePolicy() });
  },
);

router.put(
  "/admin/fare-policy",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = FarePolicyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid fare policy" });
      return;
    }
    const policy = await db.transaction(async (trx) => {
      await trx
        .update(farePoliciesTable)
        .set({ isActive: false })
        .where(eq(farePoliciesTable.isActive, true));
      const [created] = await trx
        .insert(farePoliciesTable)
        .values({ ...parsed.data, isActive: true, createdBy: authReq.user.id })
        .returning();
      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        action: "fare.policy.updated",
        metadata: { farePolicyId: created!.id, ...parsed.data },
      });
      return created!;
    });
    res.json({ policy });
  },
);

export default router;
