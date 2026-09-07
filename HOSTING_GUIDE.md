# MOVE Apayao VPS hosting guide

This deploys the landing site, admin dashboard, protected documentation, API,
GIS service, PostGIS, Redis, and automatic HTTPS. Use Ubuntu 24.04 LTS with at
least 2 vCPU, 4 GB RAM, 60 GB SSD, and a separate backup destination.

## 1. DNS and firewall

Create DNS A records for the four hostnames in `deploy/.env.production` and
point them to the VPS public IP. Allow inbound SSH, TCP 80, TCP 443, and UDP
443. PostgreSQL, Redis, API, and GIS are intentionally not published directly.

## 2. Install Docker

Install Docker Engine from Docker's official Ubuntu repository and install the
Compose plugin. Add the deployment user to the `docker` group, reconnect, then
confirm:

```bash
docker version
docker compose version
```

Do not run the application as the root login. Create a dedicated deployment
user with SSH-key authentication and disable password SSH after confirming the
key works.

## 3. Upload the repository

Clone the private repository into `/opt/move-apayao` and check out the reviewed
release commit. Do not upload local `.env.local`, Firebase JSON, JKS files, or
downloaded service-account keys.

```bash
sudo mkdir -p /opt/move-apayao
sudo chown "$USER":"$USER" /opt/move-apayao
git clone YOUR_PRIVATE_REPOSITORY_URL /opt/move-apayao
cd /opt/move-apayao
```

## 4. Configure secrets

```bash
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

Replace every example value. Generate independent random values for the
database, Redis, JWT, and GIS token. Do not reuse an Android/browser Maps key
on the server. Ensure `DATABASE_URL` and `REDIS_URL` contain URL-encoded forms
of their passwords.

## 5. Build and start private dependencies

```bash
docker compose --env-file deploy/.env.production -f compose.production.yml build
docker compose --env-file deploy/.env.production -f compose.production.yml up -d db redis
docker compose --env-file deploy/.env.production -f compose.production.yml ps
```

## 6. Apply database migrations

Back up before every later migration. For the initial empty database:

```bash
docker compose --env-file deploy/.env.production -f compose.production.yml --profile tools run --rm migrate
```

Never use `drizzle-kit push` against production. Production changes must be
reviewed migrations committed under `lib/db/drizzle`.

## 7. Start the application

```bash
docker compose --env-file deploy/.env.production -f compose.production.yml up -d
docker compose --env-file deploy/.env.production -f compose.production.yml ps
docker compose --env-file deploy/.env.production -f compose.production.yml logs --tail=100 api gis caddy
```

Caddy requests and renews TLS certificates automatically after DNS resolves and
ports 80/443 are reachable.

## 8. Verify before installing APKs

```bash
curl -fsS "https://YOUR_API_DOMAIN/api/livez"
curl -fsS "https://YOUR_API_DOMAIN/api/healthz"
```

Then test landing, dashboard login, documentation login, password email,
driver approval, one complete booking, driver GPS, IoT fallback, incident
reporting, audit logs, and analytics. Keep the pilot private until all checks
pass.

## 9. Back up PostGIS

Create an encrypted off-server backup at least daily. A manual logical backup:

```bash
mkdir -p backups
docker compose --env-file deploy/.env.production -f compose.production.yml exec -T db \
  pg_dump -U move_apayao -d move_apayao -Fc > "backups/move_apayao-$(date +%F-%H%M).dump"
```

Test restoration into a separate database before the pilot. A backup that has
never been restored is not yet a verified backup.

## 10. Deploy an update

```bash
git pull --ff-only
docker compose --env-file deploy/.env.production -f compose.production.yml build
docker compose --env-file deploy/.env.production -f compose.production.yml --profile tools run --rm migrate
docker compose --env-file deploy/.env.production -f compose.production.yml up -d
docker compose --env-file deploy/.env.production -f compose.production.yml ps
```

After the permanent HTTPS API passes staging tests, set `EXPO_PUBLIC_API_URL`
in both EAS projects and rebuild passenger and driver Android apps. Production
build guards intentionally reject localhost and ngrok URLs.
