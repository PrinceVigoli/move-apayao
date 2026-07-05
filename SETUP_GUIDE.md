# MOVE Apayao — Setup & Deployment Guide

This guide covers two phases:

1. **Run the project locally** using Docker (for Postgres/Redis) and VS Code (for the actual apps).
2. **Deploy it** to DigitalOcean, using the GitHub and Supabase accounts you already have.

It's written for the code in `System-Continue-fixed.zip`. That zip already contains a `LOCAL_SETUP.md` — this guide wraps around it, adds the Docker/VS Code specifics, and adds the DigitalOcean deployment part.

---

## 1. What's actually in this project

It's a **pnpm monorepo** with three things you can run, plus shared code (an internal
design sandbox, `artifacts/mockup-sandbox`, has been removed from this build —
it wasn't part of the product and nothing else depended on it):

| Piece | What it is | Where it runs |
|---|---|---|
| `artifacts/api-server` | Express 5 API, talks to Postgres (Drizzle ORM) and Supabase (auth) | Node process, port 5000 |
| `artifacts/dashboard` | Admin web dashboard (Vite + React) | Static site once built |
| `artifacts/mobile` | Rider/driver app (Expo / React Native) | Built via Expo/EAS, not hosted on a server |
| `lib/` | Shared DB schema, OpenAPI spec, generated API client/types | Used by the pieces above, not deployed on its own |

So when you get to hosting, you're really only hosting **two** things: the API server and the dashboard. The mobile app is distributed through Expo/App Store/Play Store, not through DigitalOcean.

Data layer:
- **Postgres** — the actual database (trips, users, wallets, etc.)
- **Supabase** — used for auth only (you don't need to self-host Supabase; you just point the API at your Supabase project's URL + service role key)
- **Redis** — optional, only used for live driver-location features

---

## 2. Accounts & tools checklist

You said you already have **GitHub** and **Supabase** — good, that covers source control and auth. Here's what else you need:

| Need | Why | You have it? |
|---|---|---|
| GitHub account | Hosts the repo, connects to DigitalOcean for auto-deploy | ✅ |
| Supabase account/project | Auth (and optionally your production Postgres — see §4.3) | ✅ |
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

Unzip `System-Continue-fixed.zip`, then open the `System-Continue` folder in VS Code (`File > Open Folder`). Open a terminal inside VS Code (`` Ctrl+` ``) — you'll do everything below from there.

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

Instead of the raw `docker run` commands in `LOCAL_SETUP.md`, use the `docker-compose.yml` included with this guide — drop it in the project root and run:

```bash
docker compose up -d
```

This starts:
- Postgres on `localhost:5432` (db `move_apayao`, user/pass `postgres`/`postgres`)
- Redis on `localhost:6379`
- Adminer (a simple DB browser) at [http://localhost:8080](http://localhost:8080) — optional, handy for peeking at tables

Check they're running: `docker ps` should show three `move-apayao-*` containers. Docker Desktop's GUI also shows this if you'd rather click than type.

### 3.4 Configure the API server

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env.local
```

Edit `artifacts/api-server/.env.local`:
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/move_apayao` (matches the Docker Postgres above)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project's **Settings > API** page
- `CORS_ALLOWED_ORIGINS=http://localhost:5173` — **required** to use the dashboard or the mobile app's web preview locally. The API denies cross-origin requests by default (this is a deliberate security fix); without this set, the dashboard's requests will be silently blocked by the browser even though the API itself is running fine. Comma-separate multiple origins if needed.
- Leave `REDIS_URL` as-is (it'll just work since Redis is running in Docker), or unset it if you don't care about live-location features locally — verified this still boots cleanly with no Redis at all.

This repo doesn't auto-load `.env` files — load it into your shell before running anything:
```bash
export $(grep -v '^#' artifacts/api-server/.env.local | xargs)
```
(Do this in every new terminal tab where you run the API server.)

### 3.5 Push the database schema

```bash
pnpm --filter @workspace/db run push
```

This creates all tables plus their indexes (added as part of the audit
fixes) and a new `pending_top_ups` table used by the wallet top-up flow.
Verified this runs clean against a fresh Postgres 16 instance.

### 3.6 Run the pieces

Each of these runs in its own VS Code terminal tab:

**API server:**
```bash
pnpm --filter @workspace/api-server run dev
```
Check it: `curl http://localhost:5000/api/healthz` → `{"status":"ok"}`. If you get `{"status":"degraded","db":"unreachable"}` with a 503 instead, the API booted fine but can't reach Postgres — check `DATABASE_URL`.

**Dashboard:**
```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/dashboard run dev
```
Open [http://localhost:5173](http://localhost:5173).

**Mobile app:**
```bash
cd artifacts/mobile
pnpm exec expo start
```
Scan the QR code with Expo Go, or press `w` for a web preview. Point it at your local API by setting `EXPO_PUBLIC_API_URL` to `http://<your-machine's-LAN-IP>:5000` (not `localhost` — a phone can't resolve that).

### 3.7 Debugging in VS Code

For the API server, you can attach VS Code's debugger instead of just reading console logs: open the Run and Debug panel, add a Node.js "Attach" config pointed at the process, or simpler — run `pnpm --filter @workspace/api-server run dev` from VS Code's integrated terminal and set breakpoints; VS Code auto-attaches to Node processes it can see in JavaScript Debug Terminal mode (`Ctrl+Shift+P` → "Debug: JavaScript Debug Terminal", then run the dev command in that terminal).

### 3.8 Shutting down

```bash
docker compose down        # stop Postgres/Redis, keep the data
docker compose down -v     # stop and wipe the data too
```

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

You already have Supabase. Two options:

- **Simplest: use Supabase's own Postgres as `DATABASE_URL` too.** Every Supabase project includes a Postgres database (find the connection string under **Settings > Database**). This means you don't need to pay for or manage a separate DigitalOcean database at all — one less moving part.
- **Alternative: DigitalOcean Managed Postgres** (~$15/mo) if you want the database physically closer to your DO app, or want it fully separate from Supabase.

For a first deployment, **use the Supabase Postgres connection string** — it's free (on Supabase's free tier) and you already have the account.

### 4.4 Deploy the API server (App Platform)

1. Push the repo to GitHub if it isn't already.
2. In the DigitalOcean dashboard: **Create > Apps**.
3. Connect your GitHub account and select the repo. Authorize access.
4. DO will scan the repo and try to detect a build. Since this is a pnpm monorepo, it's more reliable to tell it explicitly:
   - **Source directory:** repo root (needed so it can see the workspace)
   - Point it at the included `Dockerfile.api-server` for the build (App Platform supports Dockerfile-based components), **or** set:
     - Build command: `pnpm install && pnpm --filter @workspace/api-server run build`
     - Run command: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
5. Set environment variables/secrets (same names as `.env.local`): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ALLOWED_ORIGINS` (set this to your deployed dashboard's URL, e.g. `https://move-apayao-dashboard.ondigitalocean.app` — the API will reject the dashboard's requests without it), `REDIS_URL` (skip if not using Redis), `PORT` (App Platform sets this for you — the server already reads `process.env.PORT`).
6. Deploy. DO gives you an HTTPS URL immediately (e.g. `move-apayao-api.ondigitalocean.app`); add a custom domain later if you want one.

### 4.5 Deploy the dashboard (App Platform, static site)

1. In the same App Platform app (or a new one), add a **Static Site** component pointing at `artifacts/dashboard`.
2. Build command: `pnpm install && pnpm --filter @workspace/dashboard run build`
3. Output directory: `artifacts/dashboard/dist`
4. Set `VITE`-visible env vars the dashboard needs at build time (e.g. the deployed API server's URL) — check `artifacts/dashboard` source for how the API base URL is configured.

This component can usually run on App Platform's **free static-site tier**.

### 4.6 Optional: Redis on DigitalOcean

Only needed if you want live driver-location features in production. DigitalOcean offers Managed Redis/Valkey (~$25/mo). If you don't need this yet, just leave `REDIS_URL` unset in production — the server no-ops those routes, same as locally.

### 4.7 The mobile app

Nothing to deploy to DigitalOcean here. Point `EXPO_PUBLIC_API_URL` at your deployed API server's HTTPS URL, then build/distribute the app through Expo Application Services (EAS) — that's a separate, free-to-start account at [expo.dev](https://expo.dev/), not part of this DigitalOcean setup.

### 4.8 Droplet alternative (if/when you want it)

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
| `DATABASE_URL` | Yes | Local Docker Postgres, or Supabase project → Settings → Database |
| `SUPABASE_URL` | Yes | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase project → Settings → API |
| `CORS_ALLOWED_ORIGINS` | Yes (once any browser client — dashboard, mobile web preview — calls the API) | Comma-separated list of allowed origins, e.g. your deployed dashboard's URL |
| `REDIS_URL` | No | Local Docker Redis, or DO Managed Redis in production. Safe to leave unset — rate limiting falls back to an in-memory store and geo/live-location routes no-op. |
| `OPENWEATHERMAP_API_KEY` | No | Only if you use the weather feature |
| `READER_API_KEY` | No | Optional integration |
| `LOG_LEVEL` | No | `info` is a sane default |

---

## 6. Gotchas carried over from `LOCAL_SETUP.md`

- `pnpm-workspace.yaml` enforces a **1-day minimum package release age** for supply-chain safety. Don't remove it — a brand-new npm package version simply won't install until it's a day old.
- `.replit`, `@replit/vite-plugin-*`, and the mobile app's `dev` script are Replit-specific and harmless outside Replit — the dashboard plugins no-op automatically. The mobile `dev` script does need the `pnpm exec expo start` workaround shown in §3.6.
- Without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set, auth-gated API routes return 500 — this is the first thing to check if login-related calls fail.
- The Postgres pool now has a 5-second connection timeout, so a wrong/missing `DATABASE_URL` fails fast with a clear error instead of hanging.
