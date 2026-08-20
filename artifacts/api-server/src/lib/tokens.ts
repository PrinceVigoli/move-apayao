import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db, refreshTokensTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Token issuing and verification.
 *
 * Two-token scheme:
 *  - ACCESS token: a short-lived signed JWT. Sent on every API call. Verified
 *    locally with no database hit, so authentication stays cheap.
 *  - REFRESH token: a long-lived random string, stored only as a SHA-256 hash.
 *    Exchanged for a new access token, and ROTATED on every use.
 *
 * Rotation matters: because each refresh token can only be redeemed once, a
 * stolen token is detectable. If a token that has already been revoked is
 * presented, that means two parties hold it — the legitimate client and an
 * attacker — so every session for that user is killed rather than guessing
 * which one is genuine.
 */

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_BYTES = 32;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    // Refusing to boot with a weak secret is deliberate. A silently-defaulted
    // signing key would let anyone who reads this source forge admin tokens.
    throw new Error(
      "JWT_SECRET must be set to a random string of at least 32 characters. " +
        "Generate one with:  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }
  return new TextEncoder().encode(secret);
}

const ISSUER = "move-apayao";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER });
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Malformed token payload");
  }
  return { sub: payload.sub, email: payload.email, role: payload.role };
}

export async function signTrackingTicket(userId: string, tripId: number): Promise<string> {
  return new SignJWT({ type: "tracking", tripId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience("trip-tracking")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(getSecret());
}

export async function verifyTrackingTicket(
  token: string,
): Promise<{ userId: string; tripId: number }> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: "trip-tracking",
  });
  if (
    payload.type !== "tracking" ||
    typeof payload.sub !== "string" ||
    typeof payload.tripId !== "number"
  ) {
    throw new Error("Malformed tracking ticket");
  }
  return { userId: payload.sub, tripId: payload.tripId };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Creates a refresh token row and returns the raw (unhashed) token. */
async function createRefreshToken(userId: string, userAgent?: string): Promise<string> {
  const raw = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokensTable).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt,
    userAgent: userAgent?.slice(0, 200),
  });
  return raw;
}

export async function issueSession(
  user: { id: string; email: string; role: string },
  userAgent?: string,
): Promise<IssuedSession> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ sub: user.id, email: user.email, role: user.role }),
    createRefreshToken(user.id, userAgent),
  ]);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export class RefreshTokenError extends Error {
  constructor(message: string, readonly userId?: string) {
    super(message);
    this.name = "RefreshTokenError";
  }
}

/**
 * Exchanges a refresh token for a fresh session, rotating the token.
 * Throws RefreshTokenError when the token is unknown, expired or replayed.
 */
export async function rotateRefreshToken(
  rawToken: string,
  lookupUser: (userId: string) => Promise<{ id: string; email: string; role: string; isActive: boolean } | undefined>,
  userAgent?: string,
): Promise<IssuedSession> {
  const tokenHash = hashToken(rawToken);

  const result = await db.transaction(async (trx) => {
    // Only one concurrent redeemer can observe the token as active. Later
    // requests wait for this lock and then see the committed revocation.
    const [row] = await trx
      .select()
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenHash, tokenHash))
      .for("update");

    if (!row) return { kind: "invalid" as const };

    if (row.revokedAt) {
      // Return instead of throwing so the revocation commits with the
      // transaction; throwing here would roll it back.
      await trx
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokensTable.userId, row.userId), isNull(refreshTokensTable.revokedAt)));
      return { kind: "replayed" as const, userId: row.userId };
    }

    if (row.expiresAt.getTime() < Date.now()) return { kind: "expired" as const };

    const user = await lookupUser(row.userId);
    if (!user || !user.isActive) return { kind: "inactive" as const };

    const newRaw = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await trx.insert(refreshTokensTable).values({
      userId: user.id,
      tokenHash: hashToken(newRaw),
      expiresAt,
      userAgent: userAgent?.slice(0, 200),
    });

    const [claimed] = await trx
      .update(refreshTokensTable)
      .set({ revokedAt: new Date(), replacedBy: hashToken(newRaw) })
      .where(and(eq(refreshTokensTable.id, row.id), isNull(refreshTokensTable.revokedAt)))
      .returning({ id: refreshTokensTable.id });
    if (!claimed) return { kind: "invalid" as const };

    return { kind: "rotated" as const, user, newRaw };
  });

  if (result.kind === "replayed") {
    logger.warn({ userId: result.userId }, "Refresh token replay detected; revoking all sessions");
    throw new RefreshTokenError("Refresh token already used", result.userId);
  }
  if (result.kind !== "rotated") {
    throw new RefreshTokenError(
      result.kind === "expired" ? "Refresh token expired" : "Invalid refresh token",
    );
  }

  const accessToken = await signAccessToken({
    sub: result.user.id,
    email: result.user.email,
    role: result.user.role,
  });

  return { accessToken, refreshToken: result.newRaw, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export async function revokeRefreshToken(rawToken: string): Promise<string | null> {
  const [revoked] = await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.tokenHash, hashToken(rawToken)),
        isNull(refreshTokensTable.revokedAt),
      ),
    )
    .returning({ userId: refreshTokensTable.userId });
  return revoked?.userId ?? null;
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokensTable.userId, userId), isNull(refreshTokensTable.revokedAt)));
}

/** Housekeeping: drop refresh tokens that expired over a week ago. */
export async function purgeExpiredRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(refreshTokensTable)
    .where(lt(refreshTokensTable.expiresAt, cutoff))
    .returning({ id: refreshTokensTable.id });
  return deleted.length;
}

export { hashToken };
