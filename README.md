# MOVE Apayao

E-trike and e-jeepney ride booking for the Municipality of Pudtol, Apayao — built for
the Local Government Unit with support from DOST.

Passengers book a ride from their barangay and track the assigned driver in real time.
Drivers go online, accept requests, navigate to pickup, and collect the fare in cash.
Operations staff get a live fleet map plus daily ridership and revenue reporting.

## Repository layout

This is a pnpm workspace.

| Package | What it is |
| --- | --- |
| `artifacts/api-server` | Express 5 REST API — auth, trips, matching, tracking, analytics |
| `artifacts/gis-service` | Private PostGIS intelligence service — historical traces and route candidates |
| `artifacts/mobile` | Passenger app (Expo / React Native) |
| `artifacts/driver` | Driver app (Expo / React Native) |
| `artifacts/dashboard` | Admin dashboard (React + Vite) |
| `artifacts/landing` | Public marketing site (React + Vite, static) |
| `lib/db` | Drizzle schema and database client — source of truth for all tables |
| `lib/api-spec` | OpenAPI spec + Orval codegen config — source of truth for API contracts |
| `lib/api-client-react` | Generated typed React Query hooks (do not hand-edit) |
| `lib/api-zod` | Generated Zod schemas (do not hand-edit) |
| `scripts` | Operational scripts (e.g. seeding a driver account) |

## Requirements

- Node.js 22+
- pnpm 10+
- PostgreSQL 16 with PostGIS (provided by Docker Compose)
- Redis (optional locally, but driver matching is disabled without it — see below)

## Getting started

```bash
pnpm install
```

Copy `artifacts/api-server/.env.example` to `.env.local` and fill it in, then push the
schema and start the API:

```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
```

Each app runs independently:

```bash
pnpm --filter @workspace/dashboard run dev    # admin dashboard
pnpm --filter @workspace/gis-service run dev  # private GIS service
pnpm --filter @workspace/landing  run dev     # public site
pnpm --filter @workspace/mobile   run dev     # passenger app (Expo)
pnpm --filter @workspace/driver   run dev     # driver app (Expo)
```

Full instructions, including Docker for Postgres/Redis and deployment steps, are in
[`SETUP_GUIDE.md`](./SETUP_GUIDE.md).

## Common commands

```bash
pnpm run typecheck                              # typecheck every package
pnpm run build                                  # typecheck + build everything
pnpm --filter @workspace/api-spec run codegen   # regenerate API client from the OpenAPI spec
pnpm --filter @workspace/db run generate        # generate a reviewed SQL migration
pnpm --filter @workspace/db run migrate         # apply committed migrations (production)
pnpm --filter @workspace/db run push            # push schema changes (development only)
```

## Architecture notes

Point-to-point pilot bookings enforce a configurable Pudtol-Luna service
radius before any billable Google route lookup. Future vehicle trackers use
hardware-neutral, per-device credentials and feed the same live passenger
tracking stream as the driver app. See [IOT_GPS_GUIDE.md](IOT_GPS_GUIDE.md).

**API contracts are generated, not written.** Edit `lib/api-spec/openapi.yaml`, then run
the codegen command above. Never hand-edit anything under `generated/` — it will be
overwritten.

**Driver matching requires Redis.** Online drivers are held in a Redis geospatial index;
booking runs a radius search and atomically claims the nearest driver whose vehicle has
enough seats. Without `REDIS_URL` set, no driver is ever matched and trips stay in
`requested`. A background sweeper retries unmatched trips and expires them after five
minutes so passengers get a definite answer.

**GIS Intelligence is a separate private service.** Driver GPS history is stored in
PostGIS, while the dashboard accesses it only through authenticated API-server gateway
routes. The GIS service binds to `127.0.0.1:5100` by default and rejects internal calls
without `GIS_SERVICE_TOKEN`. Provincial `admin` accounts cannot see or call the GIS
module. A `superadmin` inherits normal administration access plus GIS; a `developer`
has GIS-only dashboard access.

For local development only, the GIS service falls back to the existing `JWT_SECRET`
and `http://127.0.0.1:5100` when the GIS variables are omitted. Production still
requires an independent `GIS_SERVICE_TOKEN`. Start the private process with
`pnpm --filter @workspace/gis-service run dev`.

The analyzer cleans inaccurate/mocked points, breaks traces after long GPS gaps, and
creates a draft only after the same endpoint corridor has at least three valid runs
from at least two drivers. Drafts are review material; analysis never publishes or
changes a passenger-facing route by itself.

Privileged roles cannot be selected during registration or assigned in the dashboard.
After creating a normal account, assign one locally from the project root:

```bash
pnpm staff:set-role -- --email=owner@example.com --role=superadmin
pnpm staff:set-role -- --email=developer@example.com --role=developer
```

Changing a staff role revokes that account's existing sessions.

**Authentication is self-hosted.** Accounts live in this project's own Postgres —
there is no third-party auth provider. Passwords are hashed with scrypt (Node's
standard library, so there is no native module to compile). Sign-in accepts an
email address *or* a phone number.

Passenger registration is immediate. Driver registration creates a
`driver_applicant` account with a pending driver profile; it cannot access any
driver-only endpoint until an administrator calls
`PATCH /api/admin/drivers/{userId}/approval` with `{ "status": "approved" }`.
Approval grants the `driver` role, starts the subscription, and revokes old
sessions so the driver must sign in again with the new permissions.

Sessions use two tokens: a 15-minute access JWT sent with every request, and a
30-day refresh token that is stored only as a hash and **rotated on every use**.
Because a refresh token is single-use, presenting a spent one means it was
stolen, so every session for that user is revoked. Clients share one in-flight
refresh so parallel requests can't trip that defence during normal startup.

**Fares are collected in cash.** The digital wallet and QR/NFC tap-to-pay code exists but
is switched off pending reader hardware procurement (`FEATURE_QR_FARE_COLLECTION`, default
off). Revenue reporting reads `trips.fareAmount` directly, not the wallet ledger.

**The mobile apps need native builds.** They use `react-native-maps` and background
location, so Expo Go is not sufficient — build a dev client with EAS:

```bash
eas build --profile development --platform android
```

Native Google Maps keys are injected by each app's `app.config.js` from
`GOOGLE_MAPS_ANDROID_API_KEY` and `GOOGLE_MAPS_IOS_API_KEY`; they are never committed to
`app.json`. Restrict those keys to the exact Android package/SHA-1 or iOS bundle ID.
The Places and Routes key stays server-side in the API environment.

## Troubleshooting

### `error TS6305: Output file '.../lib/db/dist/index.d.ts' has not been built from source file`

Usually arrives with a cascade of `TS7006: implicitly has an 'any' type` errors
in `api-server`. Those are a symptom: when the generated `lib/*` declarations
can't be resolved, everything flowing out of them becomes `any`.

`lib/db`, `lib/api-zod` and `lib/api-client-react` are TypeScript *composite*
projects — they compile to `dist/`, which is gitignored, so a fresh copy must
build them first. `tsc --build` is incremental and its cache can fall out of
step after the repo is copied around. Force a clean rebuild:

```bash
npx tsc --build --force
pnpm run typecheck
```

If it persists, clear the caches first:

```powershell
Remove-Item -Recurse -Force lib\*\dist -ErrorAction SilentlyContinue
Get-ChildItem -Recurse -Force -Filter '*.tsbuildinfo' |
  Where-Object { $_.FullName -notmatch 'node_modules' } | Remove-Item -Force
npx tsc --build --force
```

### `load-env.ps1 cannot be loaded ... is not digitally signed` (Windows)

PowerShell blocks unsigned scripts by default. You no longer need
`load-env.ps1` for database commands — `drizzle.config.ts` reads
`artifacts/api-server/.env.local` itself. Just run:

```bash
pnpm --filter @workspace/db run push
```

If you want the script anyway (for `psql` or other one-off tools), either allow
local scripts once for your user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

or run it without changing any policy:

```powershell
Get-Content .\load-env.ps1 | Invoke-Expression
```

### `DATABASE_URL, ensure the database is provisioned` on `db push`

`DATABASE_URL` wasn't found. Check it is set in
`artifacts/api-server/.env.local`, and that Postgres is actually running
(`docker compose up -d`).

### `ERR_PNPM_OUTDATED_LOCKFILE` on install

Run `pnpm install --no-frozen-lockfile` once. Happens when a package was added
or removed since the lockfile you have.

## Environment variables

See §5 of [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) for the full reference. The essentials:

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | api-server | Postgres connection string |
| `JWT_SECRET` | api-server | Signs access tokens — **server will not boot without it** |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | api-server | Password reset email (optional) |
| `REDIS_URL` | api-server | Driver geo-index and live tracking |
| `GOOGLE_PLACES_API_KEY` | api-server | Server-side proxy for place search |
| `GOOGLE_MAPS_SERVER_API_KEY` | api-server | Google Routes road distance and route geometry |
| `GIS_SERVICE_URL` | api-server | Private GIS origin; locally `http://127.0.0.1:5100` |
| `GIS_SERVICE_TOKEN` | api-server, gis-service | Shared random internal token, at least 32 characters |
| `GIS_SERVICE_PORT` | gis-service | Private local port; defaults to `5100` |
| `VITE_GOOGLE_MAPS_BROWSER_API_KEY` | dashboard, landing | Google Maps JavaScript basemap; use a referrer-restricted browser key |
| `VITE_API_URL` | dashboard, landing | Public API origin when a static site and API are deployed separately |
| `EXPO_PUBLIC_API_URL` | mobile, driver | LAN IP of the API server during development |
| `GOOGLE_MAPS_ANDROID_API_KEY` | mobile, driver build environment | Android SDK key restricted by package and SHA-1 |
| `GOOGLE_MAPS_IOS_API_KEY` | mobile, driver build environment | iOS SDK key restricted by bundle ID |

Never commit `.env.local` files — they are gitignored.

The dashboard and landing page are Google Maps-only. If the browser key is
missing, they show a configuration panel instead of silently falling back to
a less detailed map provider.

For Google Maps, enable **Places API** and **Routes API** for the server key,
and **Maps JavaScript API** for a separate browser key. Restrict the server key
to the API server/IP and the browser key to dashboard/landing HTTP referrers.
If Routes is temporarily unavailable, fare estimates, bookings, and loop
publishing fail safely with HTTP 503 instead of charging from a straight-line
distance fallback.

Generate a separate GIS token and paste it into
`artifacts/api-server/.env.local` without sharing or committing it:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```
