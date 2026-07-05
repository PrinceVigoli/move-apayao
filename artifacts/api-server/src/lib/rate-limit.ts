import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "./redis";
import { logger } from "./logger";
import type { AuthenticatedRequest } from "../middlewares/auth";
import type { Request } from "express";

// Only back the limiter with Redis if Redis is actually configured. Without
// this check, getRedis() returns a no-op stub (see lib/redis.ts) whose calls
// always resolve `null` — rate-limit-redis expects real Redis replies, so
// every single request would throw inside the rate-limit middleware before
// ever reaching a route. Falling back to express-rate-limit's default
// in-memory store keeps local dev (and any single-instance deployment)
// working with no Redis at all; it just won't share limits across instances.
const REDIS_CONFIGURED = !!process.env.REDIS_URL;

if (!REDIS_CONFIGURED) {
  logger.warn(
    "REDIS_URL not set — rate limiting will use an in-memory store (per-process, not shared across instances)",
  );
}

/**
 * Rate limiter factory. Backed by Redis when available so limits are shared
 * across all server instances instead of resetting per process; falls back
 * to an in-memory store otherwise (see note above).
 */
function makeLimiter(windowMs: number, limit: number, byUser = false): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: REDIS_CONFIGURED
      ? new RedisStore({
          sendCommand: (...args: [string, ...string[]]) =>
            getRedis().call(...args) as Promise<any>,
        })
      : undefined,
    keyGenerator: byUser
      ? (req: Request) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "unknown"
      : undefined,
  });
}

// General ceiling applied to the whole API.
export const generalLimiter = makeLimiter(60_000, 120);

// Tight limiter for money-moving / auth-adjacent endpoints: wallet top-up,
// NFC tap, registration. These are the highest-value targets for abuse
// (brute force, card draining, load generation) and deserve a much lower
// ceiling than general read traffic.
export const sensitiveActionLimiter = makeLimiter(60_000, 10, true);
