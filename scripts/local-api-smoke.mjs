import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Creates disposable accounts. Point this only at an isolated local test DB.
const origin = new URL(process.env.LOCAL_SMOKE_API_URL ?? "http://127.0.0.1:5500");
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)) {
  throw new Error("Local smoke tests require a loopback API URL.");
}
if (process.env.LOCAL_SMOKE_ALLOW_WRITES !== "true") {
  throw new Error("Use an isolated test database, then set LOCAL_SMOKE_ALLOW_WRITES=true.");
}

let passed = 0;
async function request(path, status, { body, token } = {}) {
  const response = await fetch(new URL(`/api${path}`, origin), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  // Do not include response bodies in assertion output: they can contain tokens.
  assert.equal(response.status, status, `${path}: unexpected HTTP status`);
  return response.status === 204 ? null : response.json();
}
function check(label) {
  passed++;
  console.log(`PASS ${label}`);
}

const email = `local-smoke-${randomBytes(8).toString("hex")}@example.test`;
const password = randomBytes(24).toString("base64url");
const registration = { email, password, fullName: "Local smoke test", role: "passenger", acceptedTerms: true };

await request("/livez", 200);
check("API liveness");
const healthResponse = await fetch(new URL("/api/healthz", origin), { redirect: "error", signal: AbortSignal.timeout(10_000) });
assert.ok([200, 503].includes(healthResponse.status));
const health = await healthResponse.json();
assert.equal(health.dependencies.database, "ok");
assert.equal(health.dependencies.redis, "ok");
check("PostgreSQL and Redis connectivity");
console.log(`Health: ${health.status}; Google Routes: ${health.dependencies.googleRoutes}`);
await request("/auth/profile", 401);
check("profile requires authentication");
await request("/auth/register", 400, { body: { ...registration, role: "admin" } });
check("public registration rejects privileged roles");
const account = await request("/auth/register", 201, { body: registration });
assert.equal(account.user.role, "passenger");
assert.equal("passwordHash" in account.user, false);
assert.ok(account.accessToken && account.refreshToken);
check("passenger registration and session issuance");
await request("/auth/register", 409, { body: registration });
check("duplicate registration rejected");
await request("/auth/login", 401, { body: { identifier: email, password: `${password}-wrong` } });
check("wrong password rejected");
const profile = await request("/auth/profile", 200, { token: account.accessToken });
assert.equal(profile.user.email, email);
check("authenticated profile");
await request("/auth/users", 403, { token: account.accessToken });
check("passenger cannot list admin users");
const loops = await request("/loops", 200);
assert.ok(Array.isArray(loops.routes));
check("loop route listing");
const rotated = await request("/auth/refresh", 200, { body: { refreshToken: account.refreshToken } });
assert.ok(rotated.accessToken && rotated.refreshToken);
assert.notEqual(rotated.refreshToken, account.refreshToken, "refresh token must rotate");
check("refresh token rotation");
await request("/auth/logout", 204, { body: { refreshToken: rotated.refreshToken } });
await request("/auth/refresh", 401, { body: { refreshToken: rotated.refreshToken } });
check("logout revokes refresh token");
const login = await request("/auth/login", 200, { body: { identifier: email, password } });
check("password login");
await request("/auth/deactivate-account", 200, { token: login.accessToken, body: { password } });
await request("/auth/profile", 401, { token: login.accessToken });
await request("/auth/login", 403, { body: { identifier: email, password } });
await request("/auth/refresh", 401, { body: { refreshToken: login.refreshToken } });
check("deactivation blocks sign-in and existing sessions");
console.log(`${passed} local API checks passed. Test account remains deactivated in the isolated database.`);
