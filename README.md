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
- PostgreSQL 16
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
pnpm --filter @workspace/db run push            # push schema changes (development only)
```

## Architecture notes

**API contracts are generated, not written.** Edit `lib/api-spec/openapi.yaml`, then run
the codegen command above. Never hand-edit anything under `generated/` — it will be
overwritten.

**Driver matching requires Redis.** Online drivers are held in a Redis geospatial index;
booking runs a radius search and atomically claims the nearest driver whose vehicle has
enough seats. Without `REDIS_URL` set, no driver is ever matched and trips stay in
`requested`. A background sweeper retries unmatched trips and expires them after five
minutes so passengers get a definite answer.

**Fares are collected in cash.** The digital wallet and QR/NFC tap-to-pay code exists but
is switched off pending reader hardware procurement (`FEATURE_QR_FARE_COLLECTION`, default
off). Revenue reporting reads `trips.fareAmount` directly, not the wallet ledger.

**The mobile apps need native builds.** They use `react-native-maps` and background
location, so Expo Go is not sufficient — build a dev client with EAS:

```bash
eas build --profile development --platform android
```

Google Maps API keys go in each app's `app.json`; the Places API key stays server-side in
the API server's environment so it is never shipped inside an app bundle.

## Environment variables

See §5 of [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) for the full reference. The essentials:

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | api-server | Postgres connection string |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | api-server | Auth verification (server-side only) |
| `REDIS_URL` | api-server | Driver geo-index and live tracking |
| `GOOGLE_PLACES_API_KEY` | api-server | Server-side proxy for place search |
| `EXPO_PUBLIC_API_URL` | mobile, driver | LAN IP of the API server during development |

Never commit `.env.local` files — they are gitignored.
