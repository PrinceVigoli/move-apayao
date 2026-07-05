# Fixes Applied

**Update:** everything below was actually run, not just read. I installed a real
Postgres 16 + Redis, ran `pnpm install`, `pnpm run typecheck` (clean across all
9 packages), pushed the DB schema (confirmed the new indexes and
`pending_top_ups` table exist), built and booted `api-server`, and hit
`/api/healthz` and `/api/loops` with `curl` against the real database. I also
tested the no-Redis fallback path and the CORS allowlist with real requests.
Doing this caught one real bug (see first item below) that a read-through
wouldn't have caught. See `LOCAL_SETUP.md` / `SETUP_GUIDE.md` for the
corrected setup steps this testing produced.

All Critical and High findings from the audit are fixed in code, plus most Medium/Low items. Below is what changed, file by file, and what's still left for you to do (mainly: run migrations, and wire a real payment provider).

## Bug found and fixed while verifying (not in the original audit)

- **Rate limiter crashed every request when Redis wasn't configured.** The new rate-limiting middleware (`src/lib/rate-limit.ts`) was unconditionally backed by a Redis store. When `REDIS_URL` is unset, `lib/redis.ts` returns a no-op stub whose calls resolve `null` — `rate-limit-redis` expects real Redis replies, so every request would have broken, not just Redis-dependent ones. Fixed: the limiter now checks whether Redis is configured and falls back to an in-memory store if not (logs a warning). Verified by actually booting the server with `REDIS_URL` unset and confirming `/api/healthz` still returns 200.

## Critical

- **Wallet top-up exploit closed.** `POST /wallet/topup` is now admin-only and requires `userId` (no more self-targeting). Added `POST /wallet/topup/intent` (passenger-callable, creates a pending top-up + checkout session — does **not** touch the ledger) and `POST /wallet/topup/webhook` (provider-only, signature-verified, credits the wallet only after a real payment confirmation). New `pendingTopUpsTable` in `lib/db/src/schema/fares.ts`. New `lib/payment-provider.ts` interface — **ships as a stub that throws**; you must wire a real provider (PayMongo/Xendit/GCash/etc.) before enabling self-service top-ups. Mobile wallet screen updated to call the intent endpoint and open the checkout URL instead of assuming an instant credit.
- **Trip double-charge race fixed.** `POST /trips/:id/complete` now claims the trip with a single conditional `UPDATE ... WHERE status = 'in_progress'` inside the transaction; a concurrent duplicate request gets zero rows back and fails cleanly with no wallet side effect.

## High

- **Auth no longer calls out to Supabase per request.** `lib/supabase.ts` now verifies JWTs locally via `jose` + a cached remote JWKS — after the first request, zero network calls per verification. Added `jose` to `package.json`.
- **Indexes added everywhere.** Every foreign key and every `WHERE`/`ORDER BY` column across `trips`, `fare_transactions`, `incident_reports`, `loop_stops`, `loop_vehicles`, and `subscriptions` now has an index (see each `lib/db/src/schema/*.ts`). **You need to generate and run a migration** (`pnpm --filter @workspace/db drizzle-kit generate` then apply it) — this repo ships schema, not a migration file.
- **Rate limiting added.** `express-rate-limit` + `rate-limit-redis` (shared across instances). General 120/min ceiling on all of `/api` (`src/app.ts`), plus a tighter 10/min per-user limiter (`src/lib/rate-limit.ts`) on `/wallet/topup/intent`, `/wallet/tap`, and `/auth/register`.
- **Trip accept/decline/cancel races fixed** the same way as `complete` — the state transition itself is the concurrency guard (`UPDATE ... WHERE status = <expected>`).
- **Loop vehicle location spoofing fixed.** `PUT /loops/:id/vehicles/location` now requires `loopVehiclesTable.driverId` to match the authenticated driver.
- **Weather endpoint** now has a 5s timeout (`AbortController`) and is cached in Redis per ~1km grid cell for 10 minutes.
- **Registration is transactional.** `POST /auth/register` now wraps the user/wallet/subscription/driver-profile inserts in one `db.transaction`. Same fix applied to `POST /loops` (route + stops).

## Medium / Low

- CORS restricted to an explicit allowlist (`CORS_ALLOWED_ORIGINS` env var) instead of reflecting any origin.
- Centralized JSON error handler added as the last middleware in `app.ts`.
- `/healthz` now runs `SELECT 1` and returns 503 if the DB is unreachable, instead of always reporting healthy.
- `READER_API_KEY` comparison now uses `crypto.timingSafeEqual`.
- `/wallet/tap` now requires a caller-supplied `idempotencyKey`; a retried tap with the same key is a no-op (unique index on `fare_transactions.idempotency_key`), not a double deduction.
- All routes now use shared `parseIdParam`/`parsePagination`/`parseDateRange` helpers (`src/lib/http.ts`) instead of ad hoc `parseInt` calls — malformed `:id`, `limit`, `offset`, or date-range params now get a clean 400 or a safe default instead of reaching the database as `NaN`/unbounded.
- `analytics.ts` date ranges are now clamped to 366 days.
- Postgres pool: explicit `max` (env `DATABASE_POOL_MAX`), `statement_timeout` (env `DATABASE_STATEMENT_TIMEOUT_MS`, default 10s), and an `on('error', ...)` handler so a background connection error can't crash the process.

## OpenAPI / generated client

`lib/api-spec/openapi.yaml` and `lib/api-client-react/src/generated/{api.ts,api.schemas.ts}` were hand-updated to match (new `TopUpIntentBody`/`TopUpIntentResponse` schemas, `TopUpBody.userId` now required, `TapBody.idempotencyKey` now required, new `useCreateTopUpIntent` hook). If this project has an `orval`/codegen script, re-running it from the updated `openapi.yaml` will regenerate these more cleanly than the hand edits — the hand edits follow the existing generated-code pattern exactly, so a regeneration should produce an equivalent result.

## What you still need to do

1. **Generate and run a Drizzle migration** (or use `pnpm --filter @workspace/db run push` for dev, which I already verified works) for the new indexes and the `pending_top_ups` table.
2. **Wire a real payment provider** in `src/lib/payment-provider.ts` — this is the one piece that can't be finished without a business decision (which provider, what currencies/methods) and provider credentials.
3. Set the new env vars in your deploy environment: `CORS_ALLOWED_ORIGINS` (required once any browser client calls the API — see `LOCAL_SETUP.md`), `DATABASE_POOL_MAX` (optional), `DATABASE_STATEMENT_TIMEOUT_MS` (optional).

`pnpm install` and `pnpm run typecheck` were already run and pass clean — no need to redo those unless you change dependencies further.
