# MOVE Apayao — Setup & Deployment Guide

This guide covers two phases:

1. **Run the project locally** using Docker (for Postgres/Redis) and VS Code (for the actual apps).
2. **Deploy it** to DigitalOcean, using the GitHub account you already have.

For a quick overview of the repository and its packages, see [`README.md`](./README.md).

---

## 1. What's actually in this project

It's a **pnpm monorepo** with several independently runnable apps, plus shared code (an internal
design sandbox, `artifacts/mockup-sandbox`, has been removed from this build —
it wasn't part of the product and nothing else depended on it):

| Piece | What it is | Where it runs |
|---|---|---|
| `artifacts/api-server` | Express 5 API, talks to Postgres (Drizzle ORM); handles authentication itself | Node process, port 5000 |
| `artifacts/gis-service` | Private GPS/PostGIS intelligence service | Node process, loopback port 5100 |
| `artifacts/dashboard` | Admin web dashboard (Vite + React) | Static site once built |
| `artifacts/mobile` | Passenger app (Expo / React Native) | Built via Expo/EAS, not hosted on a server |
| `artifacts/driver` | Driver app (Expo / React Native) | Built via Expo/EAS, not hosted on a server |
| `artifacts/landing` | Public landing site (Vite + React) | Static site once built |
| `artifacts/documentation` | Public implementation and operations documentation (Vite + React) | Static site once built |
| `lib/` | Shared DB schema, OpenAPI spec, generated API client/types | Used by the pieces above, not deployed on its own |

For the full system you host the API server, private GIS service, and two static websites.
The mobile apps are distributed through Expo/App Store/Play Store.

Data layer:
- **Postgres + PostGIS** — the actual database plus spatial GPS and route data
- **Authentication** — handled by the API server against your own Postgres. There is no third-party auth service to sign up for.
- **Redis** — required for matching, live location, streaming, and shared rate limits

---

## 2. Accounts & tools checklist

You already have **GitHub** for source control. Here's what else you need:

| Need | Why | You have it? |
|---|---|---|
| GitHub account | Hosts the repo, connects to DigitalOcean for auto-deploy | ✅ |
| **DigitalOcean account** | Hosting | Need to create |
| Docker Desktop | Runs Postgres/Redis locally without installing them on your machine | Need to install |
| VS Code | Editor, terminal, debugging | Need to install (if not already) |
| Node.js 22+ (repo targets 24) | Runs the actual app code | Need to install |
| pnpm | Package manager this repo uses | Need to install |

Install links: [Docker Desktop](https://www.docker.com/products/docker-desktop/), [VS Code](https://code.visualstudio.com/), [Node.js](https://nodejs.org/) (get 24.x to match the repo).

Once Node is installed, get pnpm:
```bash
npm install -g pnpm
```

---

## 3. Part A — Run it locally (Docker + VS Code)

### 3.1 Open the project

Clone the repository and open the project folder in VS Code (`File > Open Folder`). Open a terminal inside VS Code (`` Ctrl+` ``) — you'll run everything below from there.

Recommended: install the extensions listed in `extensions.json` (included alongside this guide) — VS Code will prompt you to install them automatically if you drop that file into `.vscode/extensions.json` in the project.

### 3.2 Install dependencies

```bash
pnpm install
```

If pnpm blocks a native build script the first time, run:
```bash
pnpm approve-builds esbuild
```

### 3.3 Start Postgres + Redis with Docker

Use the `docker-compose.yml` in the project root:

```bash
docker compose up -d
```

This starts:
- Postgres on `localhost:5432` (db `move_apayao`, user `postgres`; password defaults to
  `postgres` locally and can be changed by setting `POSTGRES_PASSWORD` before `docker compose up`)
- Redis on `localhost:6379`
- Adminer (a simple DB browser) at [http://localhost:8080](http://localhost:8080) — optional, handy for peeking at tables

Check they're running: `docker ps` should show three `move-apayao-*` containers. Docker Desktop's GUI also shows this if you'd rather click than type.

These ports and Adminer are bound to `127.0.0.1`, so they are not exposed to other
machines on the network. Do not reuse this development Compose file as a public
production database deployment.

### 3.4 Configure the API server

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env.local
```

Edit `artifacts/api-server/.env.local`:
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/move_apayao` (matches the Docker Postgres above)
- `JWT_SECRET` — any random string of 32+ characters. Generate one with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
  The server refuses to start without it, so that a defaulted key can never be used to forge admin tokens.
- `CORS_ALLOWED_ORIGINS=http://localhost:5173` — **required** to use the dashboard or the mobile app's web preview locally. The API denies cross-origin requests by default (this is a deliberate security fix); without this set, the dashboard's requests will be silently blocked by the browser even though the API itself is running fine. Comma-separate multiple origins if needed.
- Leave `REDIS_URL` as-is. Without Redis the API can boot for limited
  maintenance, but readiness is degraded and trips cannot be dispatched.
- `GIS_SERVICE_URL=http://127.0.0.1:5100`
- `GIS_SERVICE_TOKEN` — generate another random 32+ character secret with the same Node command used for `JWT_SECRET`. The GIS process reads this same `.env.local` file.
- `GIS_SERVICE_PORT=5100` — optional local override. The GIS service ignores the API's `PORT=5000` locally so the two processes cannot collide.

The API and GIS start commands load `artifacts/api-server/.env.local` automatically.

### 3.5 Push the database schema

```bash
pnpm --filter @workspace/db run push
```

This creates all tables plus their indexes (added as part of the audit
fixes) and a new `pending_top_ups` table used by the wallet top-up flow.
Verified this runs clean against a fresh Postgres 16 instance.

`push` is for local development only. For releases, generate and review a
committed SQL migration, then apply it as the deployment release step:

```bash
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run migrate
```

### 3.6 Run the pieces

Each of these runs in its own VS Code terminal tab:

**API server:**
```bash
pnpm --filter @workspace/api-server run dev
```
Check it: `curl http://localhost:5000/api/healthz` returns `{"status":"ok",...}`
only when Postgres, Redis, Google Routes configuration, and the configured GIS
service are ready. `/api/livez` checks the Node process only.

**Private GIS service:**
```bash
pnpm --filter @workspace/gis-service run dev
```
Check it at `http://127.0.0.1:5100/healthz`. Keep port 5100 private; dashboard clients
must use the API server and never call this service directly.

**Dashboard:**
```bash
pnpm --filter @workspace/dashboard run dev
```
Open [http://localhost:5173](http://localhost:5173).

**Documentation portal:**
```bash
pnpm --filter @workspace/documentation run dev
```
Open [http://localhost:5176](http://localhost:5176). The portal intentionally
contains no credentials, private tokens, or personal operational data.

To grant GIS access, first register the account normally, then run one of these locally:

```bash
pnpm staff:set-role -- --email=owner@example.com --role=superadmin
pnpm staff:set-role -- --email=developer@example.com --role=developer
```

Provincial admins remain `admin`; their navigation and API permissions exclude GIS.
The GIS **Analyze 30-day routes** action creates review-only drafts only when a corridor
has at least three valid runs from two drivers; it never publishes routes automatically.

To securely set or recover the password of an existing local account when SMTP
delivery is not configured, run the interactive command below. The password is
entered twice with terminal echo hidden; existing sessions and reset links are
revoked after the update.

```powershell
pnpm.cmd user:set-password -- --email=user@example.com
```

**Mobile app:**
```bash
pnpm --filter @workspace/mobile run dev
```
These apps require a development build; Expo Go does not include the native
Google Maps/background-location configuration. Build and install a dev client,
then start Metro:

```bash
eas build --profile development --platform android
pnpm --filter @workspace/mobile run dev
```

Set `EXPO_PUBLIC_API_URL=http://<your-machine-LAN-IP>:5000` (not `localhost`).

Native Google Maps keys are compiled into the installed app, so adding one to
`.env.local` after a build does not repair that build. Create a Maps SDK for
Android key for each app, restricted to its Android package and EAS signing
certificate SHA-1. Do not reuse the browser/referrer-restricted web map key.
Then save the key as a **sensitive** EAS environment variable in each project:

```powershell
# Passenger project (package com.moveapayao.mobile)
Set-Location artifacts/mobile
eas env:set --environment development --name GOOGLE_MAPS_ANDROID_API_KEY --value "<PASSENGER_ANDROID_KEY>" --visibility sensitive
eas build --profile development --platform android --clear-cache

# Driver project (package com.moveapayao.driver)
Set-Location ../driver
eas env:set --environment development --name GOOGLE_MAPS_ANDROID_API_KEY --value "<DRIVER_ANDROID_KEY>" --visibility sensitive
eas build --profile development --platform android --clear-cache
```

Uninstall the old development clients and install the newly built APKs. For
preview or production builds, create the same variable in the matching EAS
environment. `GOOGLE_MAPS_IOS_API_KEY` is only needed when building iOS.

### 3.6.1 Share a complete test system through one ngrok URL

For pilot testing, use one ngrok endpoint instead of exposing every internal
port. The landing Vite server acts as a development gateway:

- `/` serves the landing page.
- `/dashboard/` proxies the dashboard.
- `/api/` proxies the API used by both mobile apps.
- Postgres, Redis, Adminer, and GIS remain private.

Start these in separate PowerShell terminal tabs from the repository root:

```powershell
# Terminal 1
docker compose up -d db redis
pnpm --filter @workspace/api-server run dev

# Terminal 2
pnpm --filter @workspace/gis-service run dev

# Terminal 3
$env:BASE_PATH="/dashboard/"
pnpm --filter @workspace/dashboard run dev

# Terminal 4
pnpm --filter @workspace/landing run dev

# Terminal 5
ngrok http 5175
```

Copy the HTTPS forwarding URL printed by ngrok. If it is
`https://example.ngrok-free.dev`, update the following and restart the affected
processes:

```dotenv
# artifacts/api-server/.env.local
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://example.ngrok-free.dev

# artifacts/mobile/.env.local and artifacts/driver/.env.local
EXPO_PUBLIC_API_URL=https://example.ngrok-free.dev
```

Then run both Metro servers on different ports:

```powershell
# Terminal 6 - passenger development client
pnpm --filter @workspace/mobile run dev -- --port 8081

# Terminal 7 - driver development client
pnpm --filter @workspace/driver run dev -- --port 8082
```

Open `https://example.ngrok-free.dev/` for the landing page and
`https://example.ngrok-free.dev/dashboard/` for the dashboard. Install the
passenger and driver development APKs first; these projects intentionally use
Expo development clients rather than Expo Go because of native Google Maps and
driver background-location support. If the phones cannot reach Metro over the
same Wi-Fi, add `--tunnel` to each Metro command (slower, but remotely
reachable).

Before sharing, add the exact ngrok origin to the browser Google Maps key's
allowed HTTP referrers. Never expose ports 5432, 6379, 8080, or 5100, and do
not share an administrator password with testers.

### 3.7 Debugging in VS Code

For the API server, you can attach VS Code's debugger instead of just reading console logs: open the Run and Debug panel, add a Node.js "Attach" config pointed at the process, or simpler — run `pnpm --filter @workspace/api-server run dev` from VS Code's integrated terminal and set breakpoints; VS Code auto-attaches to Node processes it can see in JavaScript Debug Terminal mode (`Ctrl+Shift+P` → "Debug: JavaScript Debug Terminal", then run the dev command in that terminal).

### 3.8 Shutting down

```bash
docker compose down        # stop Postgres/Redis, keep the data
docker compose down -v     # stop and wipe the data too
```

### 3.9 Future IoT GPS tracker

The tracker model is intentionally not required yet. The database, secure
device provisioning, assignment history, telemetry endpoint, Redis live
tracking bridge, and PostGIS history are hardware-neutral. Follow
[IOT_GPS_GUIDE.md](IOT_GPS_GUIDE.md) after the e-jeepney and tracker arrive.

---

## 4. Part B — Deploy to DigitalOcean

### 4.1 Create the account

Sign up at [digitalocean.com](https://www.digitalocean.com/). You'll need a payment method on file even to use small paid resources.

### 4.2 Pick a hosting approach

You have two reasonable paths. Given you're already comfortable with Docker, here's how they compare:

| | **App Platform** (recommended to start) | **Droplet + Docker Compose** |
|---|---|---|
| What it is | Managed PaaS — connect your GitHub repo, DO builds & runs it | A plain Linux VM you manage yourself |
| Setup effort | Low — mostly clicking through a wizard | Higher — you SSH in, install Docker, run compose yourself |
| Matches your local Docker workflow | Partially (it still uses your Dockerfile if you give it one) | Exactly — same `docker compose` commands as local |
| Ongoing maintenance | DO handles OS patching, SSL, restarts | You handle all of it |
| Cost (2026 pricing) | ~$5/mo per running service (API server), dashboard can often run as a **free static site** | Droplets start around $4–6/mo, but you're running one VM for everything |

**Recommendation:** Start with **App Platform** — it's less to manage and plays nicely with GitHub auto-deploy. If you later want full server control (SSH access, custom cron jobs, etc.), move the API server to a Droplet using the `Dockerfile.api-server` included with this guide — the same container runs in both places. Note: this Dockerfile uses `pnpm install --frozen-lockfile`, which requires `pnpm-lock.yaml` to exactly match `package.json` — I regenerated the lockfile after adding new dependencies during the audit fixes, so this build should work as-is; if you add any dependency yourself later, run `pnpm install` locally first to update the lockfile before rebuilding the image.

### 4.3 Decide on the database

Two options:

- **DigitalOcean Managed Postgres** (~$15/mo) — same provider as the app, so the database sits close to it and backups are handled for you.
- **Any other managed Postgres** (Neon, Railway, Supabase's database product) — the app only needs a connection string; it does not depend on any provider-specific feature.

Since authentication now runs against your own database, whichever Postgres you point `DATABASE_URL` at holds the user accounts too.

### 4.4 Deploy the API server (App Platform)

1. Push the repo to GitHub if it isn't already.
2. In the DigitalOcean dashboard: **Create > Apps**.
3. Connect your GitHub account and select the repo. Authorize access.
4. DO will scan the repo and try to detect a build. Since this is a pnpm monorepo, it's more reliable to tell it explicitly:
   - **Source directory:** repo root (needed so it can see the workspace)
   - Point it at the included `Dockerfile.api-server` for the build (App Platform supports Dockerfile-based components), **or** set:
     - Build command: `pnpm install && pnpm --filter @workspace/api-server run build`
     - Run command: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
5. Set environment variables/secrets (same names as `.env.local`): `DATABASE_URL`, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS` (set this to your deployed dashboard URL), `REDIS_URL`, `GOOGLE_MAPS_SERVER_API_KEY`, `PORT`, and the private GIS settings when enabled.
6. Deploy. DO gives you an HTTPS URL immediately (e.g. `move-apayao-api.ondigitalocean.app`); add a custom domain later if you want one.

### 4.5 Deploy the dashboard (App Platform, static site)

1. In the same App Platform app (or a new one), add a **Static Site** component pointing at `artifacts/dashboard`.
2. Build command: `pnpm install && pnpm --filter @workspace/dashboard run build`
3. Output directory: `artifacts/dashboard/dist/public`
4. Set `VITE_API_URL` to the deployed API origin and
   `VITE_GOOGLE_MAPS_BROWSER_API_KEY` to the referrer-restricted browser key.

This component can usually run on App Platform's **free static-site tier**.

### 4.6 Deploy the documentation portal (App Platform, static site)

1. Add another **Static Site** component from the same repository.
2. Keep the source directory at the repository root so pnpm can resolve the workspace.
3. Build command: `pnpm install --frozen-lockfile && pnpm --filter @workspace/documentation run build`
4. Output directory: `artifacts/documentation/dist`
5. Set `VITE_PRODUCT_URL` to the public landing-page URL.
6. Set `VITE_API_URL`, `VITE_PRODUCT_URL`, and `DOCS_PUBLIC_URL` to their public HTTPS origins.
7. Add the documentation origin to the API's comma-separated `CORS_ALLOWED_ORIGINS` value.
8. Attach a domain you own, such as `documentation.moveapayao.gov.ph`, to this component.
   DigitalOcean will show the exact DNS record to add at your DNS provider and will issue TLS
   automatically after the record resolves.

The build emits clean paths such as `/deployment`, a `404.html` fallback, and a
Netlify/Cloudflare-style `_redirects` rule. If your provider has a **catch-all document**
setting, choose `index.html`. Replace the example domain with your actual registered
domain; creating the app does not register a domain or change DNS by itself.

Alternatively, the included `.github/workflows/documentation.yml` automatically
builds and deploys approved documentation changes from `main` to GitHub Pages. In
GitHub, select **Settings > Pages > Source: GitHub Actions**, configure the custom
domain, and add repository variables `DOCUMENTATION_API_URL`, `PRODUCT_URL`, and
`DOCUMENTATION_PUBLIC_URL`. GitHub manages TLS after DNS validation.

### 4.7 Redis on DigitalOcean

Redis/Valkey is required for production dispatch, live location, streaming,
and cross-instance rate limiting. Use a managed service and set `REDIS_URL`;
the readiness endpoint intentionally stays degraded when it is absent.

### 4.8 The mobile app

Nothing to deploy to DigitalOcean here. Point `EXPO_PUBLIC_API_URL` at your deployed API server's HTTPS URL, then build/distribute the app through Expo Application Services (EAS) — that's a separate, free-to-start account at [expo.dev](https://expo.dev/), not part of this DigitalOcean setup.

### 4.9 Droplet alternative (if/when you want it)

If you later move the API server to a Droplet instead of App Platform:
1. Create a Droplet (Ubuntu, Basic plan is enough to start).
2. SSH in, install Docker following DigitalOcean's own "Docker on Ubuntu" guide.
3. Copy the repo (or just `Dockerfile.api-server` + `.env`) to the Droplet, `git clone` your repo.
4. `docker build -f Dockerfile.api-server -t move-apayao-api .`
5. `docker run -d -p 80:5000 --env-file .env --restart unless-stopped move-apayao-api`
6. Point your domain's DNS at the Droplet's IP (DO's built-in DNS management is free).

---

## 5. Reference: environment variables

| Variable | Required? | Where it comes from |
|---|---|---|
| `PORT` | Yes | You choose locally (5000); App Platform sets it automatically |
| `DATABASE_URL` | Yes | Local Docker Postgres, or your managed Postgres provider |
| `JWT_SECRET` | Yes | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `GIS_SERVICE_URL` | Yes for GIS | Private internal origin, locally `http://127.0.0.1:5100` |
| `GIS_SERVICE_TOKEN` | Yes for GIS | Independent random secret, minimum 32 characters |
| `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` | No | Password reset email; links are logged if unset |
| `CORS_ALLOWED_ORIGINS` | Yes (once any browser client — dashboard, mobile web preview — calls the API) | Comma-separated list of allowed origins, e.g. your deployed dashboard's URL |
| `REDIS_URL` | Yes for dispatch/production | Local Docker Redis, or managed Redis/Valkey in production |
| `GOOGLE_PLACES_API_KEY` | Yes for place search | Server-only Places API key |
| `GOOGLE_MAPS_SERVER_API_KEY` | Yes for fares/routes | Server-only Routes API key |
| `PILOT_SERVICE_AREA_ENABLED` | No | Defaults to `true`; set `false` only for development outside the pilot area |
| `PILOT_SERVICE_AREA_CENTER_LAT` / `PILOT_SERVICE_AREA_CENTER_LON` | No | Center of the point-to-point pilot service radius |
| `PILOT_SERVICE_AREA_RADIUS_KM` | No | Defaults to 20 km around the Pudtol-Luna pilot corridor |
| `PILOT_MIN_TRIP_DISTANCE_KM` | No | Rejects accidental same-point bookings; defaults to 0.2 km |
| `VITE_API_URL` | Yes when web/API origins differ | Public API origin for dashboard and landing builds |
| `VITE_GOOGLE_MAPS_BROWSER_API_KEY` | Yes for web maps | Referrer-restricted Maps JavaScript API key |
| `GOOGLE_MAPS_ANDROID_API_KEY` / `GOOGLE_MAPS_IOS_API_KEY` | Yes for native maps | EAS build secrets; platform/app restricted |
| `TRUST_PROXY_HOPS` | No | `0` direct/ngrok; `1` with one trusted proxy |
| `OPENWEATHERMAP_API_KEY` | No | Only if you use the weather feature |
| `READER_API_KEY` | No | Optional integration |
| `LOG_LEVEL` | No | `info` is a sane default |

---

## 6. Gotchas

- `pnpm-workspace.yaml` enforces a **1-day minimum package release age** for supply-chain safety. Don't remove it — a brand-new npm package version simply won't install until it's a day old.
- The dashboard and landing site read `PORT` and `BASE_PATH` if set, but both are optional. Set `BASE_PATH` only when serving from a sub-path rather than a domain root.
- Without `JWT_SECRET` set the API server exits on startup with a clear message — this is intentional, not a bug.
- The Postgres pool now has a 5-second connection timeout, so a wrong/missing `DATABASE_URL` fails fast with a clear error instead of hanging.
