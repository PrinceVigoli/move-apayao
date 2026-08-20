import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, devicePushTokensTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const RegisterPushBody = z.object({
  token: z.string().trim().min(20).max(500),
  platform: z.enum(["ios", "android", "web"]),
  app: z.enum(["passenger", "driver"]),
});

router.put("/notifications/device", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const parsed = RegisterPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid device token" });
    return;
  }
  if (!(["passenger", "driver"] as string[]).includes(authReq.user.role)) {
    res.status(403).json({ error: "Push registration is only available to ride-app accounts" });
    return;
  }
  const expectedApp = authReq.user.role === "driver" ? "driver" : "passenger";
  if (parsed.data.app !== expectedApp) {
    res.status(403).json({ error: "This notification app does not match your account role" });
    return;
  }

  await db
    .insert(devicePushTokensTable)
    .values({ userId: authReq.user.id, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: devicePushTokensTable.token,
      set: {
        userId: authReq.user.id,
        platform: parsed.data.platform,
        app: parsed.data.app,
        updatedAt: new Date(),
      },
    });
  res.json({ ok: true });
});

router.delete("/notifications/device", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const token = z.string().trim().min(20).max(500).safeParse(req.body?.token);
  if (!token.success) {
    res.status(400).json({ error: "A valid device token is required" });
    return;
  }
  await db
    .delete(devicePushTokensTable)
    .where(
      and(
        eq(devicePushTokensTable.userId, authReq.user.id),
        eq(devicePushTokensTable.token, token.data),
      ),
    );
  res.status(204).end();
});

export default router;
