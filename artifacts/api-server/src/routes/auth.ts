import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  driverProfilesTable,
  fareWalletsTable,
  subscriptionsTable,
} from "@workspace/db";
import { requireAuth, requireJwt, type AuthenticatedRequest } from "../middlewares/auth";
import { parsePagination } from "../lib/http";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { defaultCapacityForVehicleType } from "../lib/vehicle-capacity";
import { z } from "zod";

const router: IRouter = Router();

const RegisterBody = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(["passenger", "driver"]),
  // Driver-only fields
  vehicleType: z.string().optional(),
  licenseNumber: z.string().optional(),
  plateNumber: z.string().optional(),
  vehicleColor: z.string().optional(),
});

/**
 * POST /api/auth/register
 * Called after Supabase sign-up to create the user profile in our DB.
 * The JWT must be valid — Supabase already handled credential verification.
 *
 * All four writes (user, wallet, subscription, driver profile) happen in a
 * single transaction: previously a failure partway through (e.g. a crash
 * after the user row committed but before the wallet did) left a user with
 * no wallet, which every wallet-dependent endpoint would then 404 on.
 */
router.post("/auth/register", requireJwt, sensitiveActionLimiter, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  // Check if user already exists
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, authReq.user.id));

  if (existing) {
    res.status(409).json({ error: "User already registered" });
    return;
  }

  const now = new Date();

  const { user } = await db.transaction(async (trx) => {
    const [user] = await trx
      .insert(usersTable)
      .values({
        id: authReq.user.id,
        email: authReq.user.email,
        fullName: body.fullName,
        phone: body.phone,
        role: body.role,
      })
      .returning();

    await trx.insert(fareWalletsTable).values({ userId: user.id });

    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await trx.insert(subscriptionsTable).values({
      userId: user.id,
      plan: "annual",
      status: "active",
      startsAt: now,
      expiresAt,
    });

    if (body.role === "driver") {
      await trx.insert(driverProfilesTable).values({
        userId: user.id,
        vehicleType: body.vehicleType ?? "e-trike",
        capacity: defaultCapacityForVehicleType(body.vehicleType),
        licenseNumber: body.licenseNumber,
        plateNumber: body.plateNumber,
        vehicleColor: body.vehicleColor,
      });
    }

    return { user };
  });

  req.log.info({ userId: user.id, role: body.role }, "User registered");
  res.status(201).json({ user });
});

/**
 * GET /api/auth/profile
 * Get the current user's profile, subscription, and wallet.
 */
router.get("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, authReq.user.id));

  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  // Load wallet and subscription in parallel
  const [[wallet], [subscription], [driverProfile]] = await Promise.all([
    db.select().from(fareWalletsTable).where(eq(fareWalletsTable.userId, user.id)),
    db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .orderBy(subscriptionsTable.createdAt)
      .limit(1),
    user.role === "driver"
      ? db
          .select()
          .from(driverProfilesTable)
          .where(eq(driverProfilesTable.userId, user.id))
      : Promise.resolve([undefined]),
  ]);

  res.json({ user, wallet, subscription, driverProfile });
});

/**
 * PATCH /api/auth/profile
 * Update profile fields.
 */
const UpdateProfileBody = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
});

router.patch("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, authReq.user.id))
    .returning();

  res.json({ user });
});

/**
 * GET /api/auth/users  (admin only)
 * List all users with pagination.
 */
router.get("/auth/users", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  const users = await db
    .select()
    .from(usersTable)
    .limit(limit)
    .offset(offset)
    .orderBy(usersTable.createdAt);

  res.json({ users, limit, offset });
});

export default router;
