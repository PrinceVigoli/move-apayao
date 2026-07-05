import { Request, Response, NextFunction } from "express";
import { verifyJwt } from "../lib/supabase";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string | null;
  };
}

/**
 * Middleware: require a valid Supabase JWT in Authorization header.
 * Attaches req.user with id, email, and role from our users table.
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
    const supabaseUser = await verifyJwt(token);

    // Load the user profile from our DB to get role etc.
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, supabaseUser.id));

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
 * Middleware: require a valid Supabase JWT but do NOT require the user to
 * already exist in our DB. Used for the register endpoint where the user
 * profile hasn't been created yet.
 */
export async function requireJwt(
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
    const supabaseUser = await verifyJwt(token);
    // Attach minimal user info from the JWT payload only (no DB lookup)
    (req as AuthenticatedRequest).user = {
      id: supabaseUser.id,
      email: supabaseUser.email,
      role: "passenger", // default; register will set the real role
      fullName: null,
    };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Middleware: require a specific role (or one of several roles).
 * Must be used after requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}
