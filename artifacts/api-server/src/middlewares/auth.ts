import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "../lib/tokens";

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string | null;
  };
}

export function hasProvincialAdminAccess(role: string): boolean {
  return role === "admin" || role === "superadmin";
}

export function canAccessAnyRole(actualRole: string | undefined, allowedRoles: string[]): boolean {
  return (
    actualRole != null &&
    (allowedRoles.includes(actualRole) ||
      (hasProvincialAdminAccess(actualRole) && allowedRoles.includes("admin")))
  );
}

/**
 * Requires a valid access token issued by this API (see lib/tokens.ts).
 *
 * The role is re-read from the database rather than trusted from the token.
 * An access token lives 15 minutes, so a role change or a deactivated account
 * would otherwise stay in force until it expired — not acceptable for
 * "admin" or for banning a driver mid-shift.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = authHeader.slice(7);

  try {
    const claims = await verifyAccessToken(token);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, claims.sub));

    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not found or inactive" });
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Requires a specific role (or one of several). Use after requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const actualRole = authReq.user?.role;
    // superadmin inherits provincial-admin permissions. The developer role is
    // intentionally NOT inherited: it can access only endpoints that name it
    // explicitly, chiefly the isolated GIS gateway.
    const allowed = canAccessAnyRole(actualRole, roles);
    if (!allowed) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}
