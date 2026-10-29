import { Router, type IRouter, type Response } from "express";
import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  driverProfilesTable,
  fareWalletsTable,
  subscriptionsTable,
  passwordResetTokensTable,
  tripsTable,
  hashPassword,
  verifyPassword,
  needsRehash,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
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
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { removeDriverGeo } from "../lib/redis";

const router: IRouter = Router();

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const DASHBOARD_REFRESH_COOKIE = "moveapayao_staff_refresh";
const DASHBOARD_ROLES = new Set(["admin", "superadmin", "developer"]);

function setDashboardRefreshCookie(res: Response, token: string): void {
  res.cookie(DASHBOARD_REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearDashboardRefreshCookie(res: Response): void {
  res.clearCookie(DASHBOARD_REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/api/auth",
  });
}

async function takeAccountOutOfDriverPool(userId: string): Promise<void> {
  await db
    .update(driverProfilesTable)
    .set({ isOnShift: false, isAvailable: false, updatedAt: new Date() })
    .where(eq(driverProfilesTable.userId, userId));
  await removeDriverGeo(userId).catch(() => undefined);
}

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

export const RegisterBody = z
  .object({
    email: z.string().email(),
    password: passwordSchema,
    fullName: z.string().trim().min(1),
    phone: phoneSchema.optional(),
    // Public callers may apply to drive, but only an administrator can grant
    // the privileged "driver" role.
    role: z.enum(["passenger", "driver_applicant"]),
    vehicleType: z.string().trim().min(1).optional(),
    licenseNumber: z.string().trim().min(1).optional(),
    plateNumber: z.string().trim().min(1).optional(),
    vehicleColor: z.string().trim().min(1).optional(),
    acceptedTerms: z.literal(true, {
      message: "You must accept the Terms and Privacy Policy",
    }),
    termsVersion: z.string().trim().min(1).max(40).default("2026-08-27"),
  })
  .superRefine((body, ctx) => {
    if (body.role !== "driver_applicant") return;
    for (const field of ["vehicleType", "licenseNumber", "plateNumber"] as const) {
      if (!body[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for driver applications`,
        });
      }
    }
  });

/**
 * POST /api/auth/register
 *
 * Creates the account and signs the user straight in. All writes (user,
 * wallet, optional driver profile) share one transaction so a failure
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
        termsAcceptedAt: now,
        termsVersion: body.termsVersion,
      })
      .returning();

    await trx.insert(fareWalletsTable).values({ userId: created!.id });

    if (body.role === "driver_applicant") {
      await trx.insert(driverProfilesTable).values({
        userId: created!.id,
        vehicleType: body.vehicleType!,
        capacity: defaultCapacityForVehicleType(body.vehicleType),
        licenseNumber: body.licenseNumber!,
        plateNumber: body.plateNumber!,
        vehicleColor: body.vehicleColor,
        approvalStatus: "pending",
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
  client: z.enum(["mobile", "dashboard"]).optional(),
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
  if (parsed.data.client === "dashboard" && !DASHBOARD_ROLES.has(user.role)) {
    res.status(403).json({ error: "This account does not have dashboard access" });
    return;
  }

  // Transparently upgrade hashes that predate a parameter increase.
  if (needsRehash(user.passwordHash)) {
    const rehashed = await hashPassword(parsed.data.password);
    await db.update(usersTable).set({ passwordHash: rehashed }).where(eq(usersTable.id, user.id));
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const [driverApplication] = await db
    .select({
      status: driverProfilesTable.approvalStatus,
      reason: driverProfilesTable.reviewReason,
    })
    .from(driverProfilesTable)
    .where(eq(driverProfilesTable.userId, user.id));
  const session = await issueSession(user, req.headers["user-agent"]);
  if (parsed.data.client === "dashboard") {
    setDashboardRefreshCookie(res, session.refreshToken);
  }
  res.json({
    user: {
      ...publicUser(user),
      driverApplicationStatus: driverApplication?.status,
      driverApplicationReason: driverApplication?.reason,
    },
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    ...(parsed.data.client === "dashboard" ? {} : { refreshToken: session.refreshToken }),
  });
});

/* ------------------------------------------------------------------ */
/* Refresh / logout                                                    */
/* ------------------------------------------------------------------ */

const RefreshBody = z.object({ refreshToken: z.string().min(10) });

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const parsed = RefreshBody.safeParse(req.body);
  const cookieToken = req.cookies?.[DASHBOARD_REFRESH_COOKIE] as string | undefined;
  const rawToken = cookieToken ?? (parsed.success ? parsed.data.refreshToken : undefined);
  if (!rawToken) {
    res.status(401).json({ error: "Session expired, please sign in again" });
    return;
  }

  try {
    const session = await rotateRefreshToken(
      rawToken,
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
    if (cookieToken) {
      setDashboardRefreshCookie(res, session.refreshToken);
      res.json({ accessToken: session.accessToken, expiresIn: session.expiresIn });
    } else {
      res.json(session);
    }
  } catch (err) {
    if (err instanceof RefreshTokenError) {
      if (err.userId) await takeAccountOutOfDriverPool(err.userId);
      if (cookieToken) clearDashboardRefreshCookie(res);
      res.status(401).json({ error: "Session expired, please sign in again" });
      return;
    }
    throw err;
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const parsed = RefreshBody.safeParse(req.body);
  const cookieToken = req.cookies?.[DASHBOARD_REFRESH_COOKIE] as string | undefined;
  const rawToken = cookieToken ?? (parsed.success ? parsed.data.refreshToken : undefined);
  if (rawToken) {
    const userId = await revokeRefreshToken(rawToken);
    if (userId) await takeAccountOutOfDriverPool(userId);
  }
  if (cookieToken) clearDashboardRefreshCookie(res);
  // Always 204 — a client signing out has nothing useful to do with the
  // information that its token was already invalid.
  res.status(204).end();
});

/** Ends every session for the signed-in user (all devices). */
router.post("/auth/logout-all", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  await revokeAllUserSessions(authReq.user.id);
  await takeAccountOutOfDriverPool(authReq.user.id);
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
  const responseNotBefore = Date.now() + 350 + randomInt(0, 100);
  const parsed = ForgotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const email = normaliseEmail(parsed.data.email);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (user && user.isActive) {
    const rawToken = randomBytes(32).toString("base64url");
    await db.transaction(async (trx) => {
      // Only the newest reset email remains usable. This prevents an older
      // link from unexpectedly changing the password after a newer request.
      await trx
        .update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokensTable.userId, user.id),
            isNull(passwordResetTokensTable.usedAt),
          ),
        );
      await trx.insert(passwordResetTokensTable).values({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });
    });

    const base =
      process.env.PASSWORD_RESET_URL_BASE ?? "https://moveapayao.gov.ph/reset-password";
    const resetUrl = `${base}?token=${rawToken}`;

    // Do not wait for SMTP only for known accounts: that would disclose
    // account existence through response timing.
    void sendPasswordResetEmail(user.email, resetUrl).catch((err) => {
      req.log.error({ err }, "Failed to send password reset email");
    });
  }

  const remainingDelayMs = responseNotBefore - Date.now();
  if (remainingDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingDelayMs));
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

  const passwordHash = await hashPassword(parsed.data.password);

  const consumed = await db.transaction(async (trx) => {
    // Serialise consumers of this token. Without the row lock, two requests
    // can both pass the unused check and race to set different passwords.
    const [row] = await trx
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, hashToken(parsed.data.token)),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )
      .for("update");

    if (!row || row.expiresAt.getTime() < Date.now()) return null;

    const [claimed] = await trx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokensTable.id, row.id),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )
      .returning({ id: passwordResetTokensTable.id });
    if (!claimed) return null;

    await trx
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, row.userId));

    await trx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokensTable.userId, row.userId),
          isNull(passwordResetTokensTable.usedAt),
        ),
      );
    return { userId: row.userId };
  });

  if (!consumed) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }

  // A password change must end existing sessions, or whoever already had
  // access keeps it — which defeats the point of resetting.
  await revokeAllUserSessions(consumed.userId);
  await takeAccountOutOfDriverPool(consumed.userId);

  req.log.info({ userId: consumed.userId }, "Password reset completed");
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
    await takeAccountOutOfDriverPool(user.id);
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
      .orderBy(desc(subscriptionsTable.createdAt))
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

const DeleteAccountBody = z.object({
  password: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Deactivation is recoverable by an administrator and preserves trip/audit
 * records. It immediately revokes every session and removes the account from
 * active service without destroying legally relevant operational history.
 */
router.post(
  "/auth/deactivate-account",
  requireAuth,
  sensitiveActionLimiter,
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = DeleteAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user.id));
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: "Password is incorrect" });
      return;
    }
    const [activeTrip] = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(
        and(
          or(eq(tripsTable.passengerId, user.id), eq(tripsTable.driverId, user.id)),
          inArray(tripsTable.status, ["requested", "matched", "accepted", "arrived", "in_progress"]),
        ),
      )
      .limit(1);
    if (activeTrip) {
      res.status(409).json({
        error: "Your account cannot be deactivated during an active trip. Cancel or complete it first.",
        activeTripId: activeTrip.id,
      });
      return;
    }
    await db.transaction(async (trx) => {
      await trx
        .update(usersTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      if (user.role === "driver") {
        await trx
          .update(driverProfilesTable)
          .set({ isOnShift: false, isAvailable: false, updatedAt: new Date() })
          .where(eq(driverProfilesTable.userId, user.id));
      }
    });
    await revokeAllUserSessions(user.id);
    await takeAccountOutOfDriverPool(user.id);
    req.log.info({ userId: user.id, reason: parsed.data.reason }, "Account deactivated by owner");
    res.json({ message: "Your account has been deactivated." });
  },
);

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

router.get("/auth/users", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

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
    .where(
      authReq.user.role === "admin"
        ? notInArray(usersTable.role, ["superadmin", "developer"])
        : undefined,
    )
    .limit(limit)
    .offset(offset)
    .orderBy(usersTable.createdAt);

  res.json({ users, limit, offset });
});

export default router;
