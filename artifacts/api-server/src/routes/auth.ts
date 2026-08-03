import { Router, type IRouter } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  driverProfilesTable,
  fareWalletsTable,
  subscriptionsTable,
  passwordResetTokensTable,
  hashPassword,
  verifyPassword,
  needsRehash,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { parsePagination } from "../lib/http";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { defaultCapacityForVehicleType } from "../lib/vehicle-capacity";
import {
  issueSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  RefreshTokenError,
  hashToken,
} from "../lib/tokens";
import { sendPasswordResetEmail } from "../lib/mailer";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const router: IRouter = Router();

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Length beats character-class rules; keep the floor simple and honest. */
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^[0-9+\-\s()]+$/, "Phone number contains invalid characters");

/** Stored normalised so "0908 924 9750" and "09089249750" are one account. */
function normalisePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The password hash must never leave the server, even to the account owner. */
function publicUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

const RegisterBody = z.object({
  email: z.string().email(),
  password: passwordSchema,
  fullName: z.string().min(1),
  phone: phoneSchema.optional(),
  role: z.enum(["passenger", "driver"]),
  vehicleType: z.string().optional(),
  licenseNumber: z.string().optional(),
  plateNumber: z.string().optional(),
  vehicleColor: z.string().optional(),
});

/**
 * POST /api/auth/register
 *
 * Creates the account and signs the user straight in. All writes (user,
 * wallet, subscription, driver profile) share one transaction so a failure
 * partway through cannot leave a user without a wallet.
 */
router.post("/auth/register", sensitiveActionLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const body = parsed.data;
  const email = normaliseEmail(body.email);
  const phone = body.phone ? normalisePhone(body.phone) : undefined;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      phone
        ? or(eq(usersTable.email, email), eq(usersTable.phone, phone))
        : eq(usersTable.email, email),
    );

  if (existing) {
    res.status(409).json({ error: "An account with that email or phone already exists" });
    return;
  }

  const passwordHash = await hashPassword(body.password);
  const now = new Date();

  const { user } = await db.transaction(async (trx) => {
    const [created] = await trx
      .insert(usersTable)
      .values({
        email,
        phone,
        passwordHash,
        fullName: body.fullName,
        role: body.role,
      })
      .returning();

    await trx.insert(fareWalletsTable).values({ userId: created!.id });

    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await trx.insert(subscriptionsTable).values({
      userId: created!.id,
      plan: "annual",
      status: "active",
      startsAt: now,
      expiresAt,
    });

    if (body.role === "driver") {
      await trx.insert(driverProfilesTable).values({
        userId: created!.id,
        vehicleType: body.vehicleType ?? "e-trike",
        capacity: defaultCapacityForVehicleType(body.vehicleType),
        licenseNumber: body.licenseNumber,
        plateNumber: body.plateNumber,
        vehicleColor: body.vehicleColor,
      });
    }

    return { user: created! };
  });

  const session = await issueSession(user, req.headers["user-agent"]);
  req.log.info({ userId: user.id, role: body.role }, "User registered");
  res.status(201).json({ user: publicUser(user), ...session });
});

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

const LoginBody = z.object({
  /** Either an email address or a phone number. */
  identifier: z.string().min(3),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 *
 * Accepts email OR phone. Every failure returns the same message: telling a
 * caller "no such account" versus "wrong password" hands them a way to
 * enumerate who is registered.
 */
router.post("/auth/login", sensitiveActionLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const raw = parsed.data.identifier.trim();
  const asEmail = normaliseEmail(raw);
  const asPhone = normalisePhone(raw);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, asEmail), eq(usersTable.phone, asPhone)));

  // Runs even when the user is missing so the response time doesn't reveal
  // whether the account exists.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash);

  if (!user || !ok) {
    res.status(401).json({ error: "Incorrect email/phone or password" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "This account has been deactivated" });
    return;
  }

  // Transparently upgrade hashes that predate a parameter increase.
  if (needsRehash(user.passwordHash)) {
    const rehashed = await hashPassword(parsed.data.password);
    await db.update(usersTable).set({ passwordHash: rehashed }).where(eq(usersTable.id, user.id));
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const session = await issueSession(user, req.headers["user-agent"]);
  res.json({ user: publicUser(user), ...session });
});

/* ------------------------------------------------------------------ */
/* Refresh / logout                                                    */
/* ------------------------------------------------------------------ */

const RefreshBody = z.object({ refreshToken: z.string().min(10) });

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const parsed = RefreshBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const session = await rotateRefreshToken(
      parsed.data.refreshToken,
      async (userId) => {
        const [u] = await db
          .select({
            id: usersTable.id,
            email: usersTable.email,
            role: usersTable.role,
            isActive: usersTable.isActive,
          })
          .from(usersTable)
          .where(eq(usersTable.id, userId));
        return u;
      },
      req.headers["user-agent"],
    );
    res.json(session);
  } catch (err) {
    if (err instanceof RefreshTokenError) {
      res.status(401).json({ error: "Session expired, please sign in again" });
      return;
    }
    throw err;
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const parsed = RefreshBody.safeParse(req.body);
  if (parsed.success) {
    await revokeRefreshToken(parsed.data.refreshToken);
  }
  // Always 204 — a client signing out has nothing useful to do with the
  // information that its token was already invalid.
  res.status(204).end();
});

/** Ends every session for the signed-in user (all devices). */
router.post("/auth/logout-all", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  await revokeAllUserSessions(authReq.user.id);
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* ------------------------------------------------------------------ */

const ForgotBody = z.object({ email: z.string().email() });

/**
 * POST /api/auth/forgot-password
 *
 * Always returns the same 200 response whether or not the address is
 * registered — varying it would let anyone test which emails have accounts.
 */
router.post("/auth/forgot-password", sensitiveActionLimiter, async (req, res): Promise<void> => {
  const parsed = ForgotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const email = normaliseEmail(parsed.data.email);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (user && user.isActive) {
    const rawToken = randomBytes(32).toString("base64url");
    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    const base =
      process.env.PASSWORD_RESET_URL_BASE ?? "https://moveapayao.gov.ph/reset-password";
    const resetUrl = `${base}?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      // The token is already stored; surfacing mail-server trouble here would
      // also confirm to the caller that the address exists.
      req.log.error({ err }, "Failed to send password reset email");
    }
  }

  res.json({ message: "If that email is registered, a reset link has been sent." });
});

const ResetBody = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

router.post("/auth/reset-password", sensitiveActionLimiter, async (req, res): Promise<void> => {
  const parsed = ResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const [row] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, hashToken(parsed.data.token)),
        isNull(passwordResetTokensTable.usedAt),
      ),
    );

  if (!row || row.expiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await db.transaction(async (trx) => {
    await trx
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, row.userId));
    await trx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, row.id));
  });

  // A password change must end existing sessions, or whoever already had
  // access keeps it — which defeats the point of resetting.
  await revokeAllUserSessions(row.userId);

  req.log.info({ userId: row.userId }, "Password reset completed");
  res.json({ message: "Password updated. Please sign in with your new password." });
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

router.post(
  "/auth/change-password",
  requireAuth,
  sensitiveActionLimiter,
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = ChangePasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user.id));
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    await revokeAllUserSessions(user.id);
    res.json({ message: "Password changed. Please sign in again." });
  },
);

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

router.get("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user.id));

  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const [[wallet], [subscription], [driverProfile]] = await Promise.all([
    db.select().from(fareWalletsTable).where(eq(fareWalletsTable.userId, user.id)),
    db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .orderBy(subscriptionsTable.createdAt)
      .limit(1),
    user.role === "driver"
      ? db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, user.id))
      : Promise.resolve([undefined]),
  ]);

  res.json({ user: publicUser(user), wallet, subscription, driverProfile });
});

const UpdateProfileBody = z.object({
  fullName: z.string().min(1).optional(),
  phone: phoneSchema.optional(),
  avatarUrl: z.string().optional(),
});

router.patch("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.phone) patch.phone = normalisePhone(parsed.data.phone);

  const [user] = await db
    .update(usersTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(usersTable.id, authReq.user.id))
    .returning();

  res.json({ user: publicUser(user!) });
});

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

router.get("/auth/users", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  // Explicit column list so the password hash can never be included by
  // accident if the table gains columns later.
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      phone: usersTable.phone,
      fullName: usersTable.fullName,
      role: usersTable.role,
      avatarUrl: usersTable.avatarUrl,
      isActive: usersTable.isActive,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .limit(limit)
    .offset(offset)
    .orderBy(usersTable.createdAt);

  res.json({ users, limit, offset });
});

export default router;
