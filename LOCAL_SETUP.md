# Running MOVE Apayao locally (outside Replit)

This is a pnpm workspace with 3 deployable pieces (a 4th, `artifacts/mockup-sandbox`,
was an internal design sandbox and has been removed — it wasn't part of the
product and nothing else in the repo depended on it):

- `artifacts/api-server` — Express 5 API (port via `PORT`)
- `artifacts/dashboard` — Vite/React admin dashboard
- `artifacts/mobile` — Expo/React Native app

Shared code lives in `lib/` (db schema, generated API client/zod, OpenAPI spec).

## 0. What I actually verified for you

Beyond the security/reliability audit fixes (see `CHANGES.md`), I ran this
project end-to-end before handing it back: real Postgres + Redis, real
`pnpm install`, real `pnpm run typecheck`, a real schema push, and a real
boot of the API server hit with `curl`. Fixed along the way:

1. **Rate limiter crashed every request when Redis wasn't configured.**
   The new rate-limiting middleware (added as part of the security fixes)
   was unconditionally backed by a Redis store. When `REDIS_URL` is unset,
   `lib/redis.ts` returns a no-op stub, and the rate limiter would get
   `null` back from every call instead of a real Redis reply — breaking
   every single API request, not just Redis-dependent ones. Fixed: the
   limiter now falls back to an in-memory store when Redis isn't configured
   (logs a warning, works fine for local dev / single-instance deploys).
   **This means "leave `REDIS_URL` unset if you don't need it" is true
   again** — I verified it by actually booting the server with no Redis
   and hitting `/api/healthz` repeatedly.
2. **CORS is no longer wide open — you must set `CORS_ALLOWED_ORIGINS`.**
   As part of the security fixes, the API now denies all cross-origin
   requests by default instead of allowing any origin. This means the
   dashboard (`http://localhost:5173`) and the mobile app's web preview
   won't be able to call the API unless you set
   `CORS_ALLOWED_ORIGINS=http://localhost:5173` (comma-separate more origins
   if needed) in `.env.local`. This is new — earlier versions of this repo
   didn't need it. I confirmed with `curl` that a request from an origin
   *not* in this list gets no `Access-Control-Allow-Origin` header (so a
   real browser blocks it), while an allowed origin does.
3. **Auth-gated routes without Supabase configured now return 401, not
   500.** As part of switching JWT verification to a local/JWKS-based check
   (also a security fix), a missing `SUPABASE_URL` now surfaces as a clean
   401 "Unauthorized" instead of an unhandled error. Functionally the same
   takeaway as before (set Supabase env vars or auth won't work), just a
   more correct status code.
4. (Carried over from the previous pass) Dashboard/mobile TypeScript fixes,
   and the Postgres pool has a 5s `connectionTimeoutMillis` plus an explicit
   `max` pool size and `statement_timeout` so a missing/wrong `DATABASE_URL`
   or a slow query fails fast instead of hanging.

After all of this: `pnpm run typecheck` passes clean across every package,
`api-server` builds, boots, pushes its schema, and its DB-backed routes
(`/api/healthz`, `/api/loops`) respond correctly against a real local
Postgres — I checked all of this directly, not just by reading the code.

## 1. Prerequisites

- Node.js 22+ (repo targets Node 24; 22 also works — I tested on 22)
- pnpm (`npm i -g pnpm`)
- A Postgres database (local Docker is easiest — see `docker-compose.yml`)
- (Optional) Redis, only needed for live driver-location features and to
  share rate limits across multiple server instances — safe to skip locally
- A Supabase project (free tier is fine) for auth — the API only needs the
  URL + service role key, you don't need to self-host Supabase

## 2. Install

```bash
pnpm install
```

If pnpm blocks native build scripts the first time, run:

```bash
pnpm approve-builds esbuild
```

## 3. Spin up Postgres (and optionally Redis) locally

Easiest with the included `docker-compose.yml`:

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` (db `move_apayao`, user/pass
`postgres`/`postgres`), Redis on `localhost:6379`, and Adminer (a DB browser)
at http://localhost:8080 — optional, handy for peeking at tables.

(Or, without Docker Compose, the equivalent raw commands:)

```bash
docker run -d --name move-apayao-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=move_apayao postgres:16
docker run -d --name move-apayao-redis -p 6379:6379 redis:7
```

## 4. Configure the API server

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env.local
```

Fill in / confirm:
- `DATABASE_URL` — e.g. `postgres://postgres:postgres@localhost:5432/move_apayao`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project
  settings (API tab). Without these, login/auth-gated routes return 401.
- `CORS_ALLOWED_ORIGINS=http://localhost:5173` — **required** if you're
  running the dashboard or the mobile app's web preview locally; the API
  denies cross-origin requests by default otherwise. Comma-separate
  multiple origins if you need both, e.g. the dashboard and Expo's web
  preview port.
- Leave `REDIS_URL` unset if you skipped Redis — the server still boots and
  just no-ops those features (verified — see §0).

Export the vars before running (this repo doesn't auto-load `.env` files,
it reads `process.env` directly):

```bash
export $(grep -v '^#' artifacts/api-server/.env.local | xargs)
```

## 5. Push the DB schema

```bash
pnpm --filter @workspace/db run push
```

## 6. Run the API server

```bash
pnpm --filter @workspace/api-server run dev
```

Sanity check:

```bash
curl http://localhost:5000/api/healthz    # -> {"status":"ok"}
curl http://localhost:5000/api/loops      # -> {"routes":[]} (empty until you add data)
```

If `/healthz` returns `{"status":"degraded","db":"unreachable"}` with a 503,
the API is up but can't reach Postgres — check `DATABASE_URL`.

## 7. Run the dashboard

The dashboard's `vite.config.ts` requires `PORT` and `BASE_PATH` (Replit sets
these automatically; locally you set them yourself):

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/dashboard run dev
```

Open http://localhost:5173. Make sure `CORS_ALLOWED_ORIGINS` on the API
includes this origin (see §4) or requests from the dashboard will be
silently blocked by the browser.

## 8. Run the mobile app

The `dev` script in `artifacts/mobile/package.json` is wired for Replit's
tunnel domain env vars (`REPLIT_DEV_DOMAIN`, etc.) and won't work as-is
outside Replit. Run Expo directly instead:

```bash
cd artifacts/mobile
pnpm exec expo start
```

Then scan the QR code with Expo Go (native — not subject to browser CORS),
or press `w` for the web preview (a real browser — subject to CORS, so add
its origin to `CORS_ALLOWED_ORIGINS` too if you use it). Point the app at
your local API by setting `EXPO_PUBLIC_API_URL` (check `artifacts/mobile`
source for how the base URL is read/configured — search for `setBaseUrl`
calls) to `http://<your-machine-ip>:5000` — `localhost` won't resolve from
a phone on Expo Go.

## 9. Regenerating the API client (only if you change the OpenAPI spec)

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Gotchas worth knowing

- `pnpm-workspace.yaml` enforces a **1-day minimum package release age**
  for supply-chain safety — a brand-new npm release won't install until
  it's a day old. This is intentional; don't remove it.
- `.replit`, `@replit/vite-plugin-*`, and the mobile `dev` script's env vars
  are Replit-specific scaffolding. They're harmless locally (the dashboard
  plugins simply no-op when `REPL_ID` isn't set) but the mobile `dev` script
  itself needs the workaround in step 8.
- `CORS_ALLOWED_ORIGINS` and the rate limiter's Redis fallback (see §0) are
  new as of the security-audit fixes — if you're comparing notes with an
  older checkout of this repo, these behaviors won't be there.
