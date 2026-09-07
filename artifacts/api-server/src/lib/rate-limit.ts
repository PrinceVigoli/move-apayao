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
function makeLimiter(
  namespace: string,
  windowMs: number,
  limit: number,
  byUser = false,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: REDIS_CONFIGURED
      ? new RedisStore({
          // Multiple limiters run on sensitive routes. A unique prefix keeps
          // the API-wide counter separate from the stricter auth/money counter
          // and prevents one request from incrementing the same Redis key twice.
          prefix: `move-apayao:rate-limit:${namespace}:`,
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
// High enough for several drivers sharing carrier NAT while endpoint-specific
// limiters still protect expensive/sensitive operations.
export const generalLimiter = makeLimiter("general", 60_000, 600);

// Authenticated map/search reads are limited per account, not only per shared
// mobile IP, which avoids both location scraping and carrier-NAT false blocks.
export const readIntensiveLimiter = makeLimiter("read-intensive", 60_000, 60, true);

// Tight limiter for money-moving / auth-adjacent endpoints: wallet top-up,
// NFC tap, registration. These are the highest-value targets for abuse
// (brute force, card draining, load generation) and deserve a much lower
// ceiling than general read traffic.
export const sensitiveActionLimiter = makeLimiter("sensitive", 60_000, 10, true);
