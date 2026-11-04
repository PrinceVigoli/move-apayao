import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";

const database = new URL(process.env.DATABASE_URL ?? "");
const origin = new URL(
  process.env.LOCAL_SMOKE_API_URL ?? "http://127.0.0.1:5501",
);
const redisUrl = new URL(process.env.REDIS_URL ?? "");
const local = (value) => ["127.0.0.1", "localhost", "[::1]"].includes(value);
if (
  process.env.LOCAL_FIXED_LOOP_TEST !== "1" ||
  !local(database.hostname) ||
  !local(origin.hostname) ||
  !local(redisUrl.hostname) ||
  !/^\/move_apayao_validation_(suite_|ci)/.test(database.pathname)
)
  throw Error("Isolated local suite database and Redis required.");
const require = createRequire(
  path.resolve("artifacts/api-server/package.json"),
);
const { Client } = createRequire(path.resolve("lib/db/package.json"))("pg");
const Redis = require("ioredis");
const sql = new Client({ connectionString: database.href }),
  redis = new Redis(redisUrl.href);
await sql.connect();
let ticketId, originalRun, originalUser, outsiderId;
let passed = 0;
const check = (label) => {
  passed++;
  console.log(`PASS ${label}`);
};
async function request(
  url,
  expected,
  actor,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(new URL(`/api${url}`, origin), {
      method,
      headers: {
        ...(actor ? { Authorization: `Bearer ${actor.accessToken}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (response.status !== 429) break;
    await response.arrayBuffer();
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(
          60_000,
          Math.max(
            1000,
            Number(response.headers.get("retry-after") || 60) * 1000,
          ),
        ),
      ),
    );
  }
  const result = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${url}: ${result.error ?? "unexpected status"}`,
  );
  return result;
}
try {
  const credentials = JSON.parse(
    await readFile("local-secrets/fixed-loop-local-test.json", "utf8"),
  );
  const login = (account) =>
    request("/auth/login", 200, null, {
      identifier: account.email,
      password: account.password,
    });
  const a = await login(credentials.passengers[0]),
    b = await login(credentials.passengers[1]),
    operator = await login(credentials.operator),
    admin = await login(credentials.admin);
  const {
    rows: [user],
  } = await sql.query(
    "select id,full_name,avatar_url from users where email=$1",
    [credentials.passengers[0].email],
  );
  assert.equal(a.user.id, user.id, "API must use the isolated suite database");
  originalUser = user;
  outsiderId = randomUUID();
  const email = `${outsiderId}@moveapayao.test`;
  await sql.query(
    "insert into users(id,email,password_hash,full_name,role,terms_accepted_at,terms_version) select $1,$2,password_hash,'Other Test Driver','driver',terms_accepted_at,terms_version from users where id=$3",
    [outsiderId, email, operator.user.id],
  );
  await sql.query(
    "insert into driver_profiles(user_id,vehicle_type,capacity,approval_status) values($1,'e-jeepney',29,'approved')",
    [outsiderId],
  );
  const otherDriver = await login({
    email,
    password: credentials.operator.password,
  });
  const photo = `data:image/jpeg;base64,${(await readFile("scripts/fixtures/profile-photo.jpg")).toString("base64")}`;
  await request(
    "/auth/profile",
    200,
    a,
    { fullName: "Photo Test Passenger", avatarUrl: photo },
    "PATCH",
  );
  const profile = await request("/auth/profile", 200, a);
  assert.equal(profile.user.avatarUrl, photo);
  assert.equal(profile.user.fullName, "Photo Test Passenger");
  await request(
    "/auth/profile",
    400,
    a,
    { avatarUrl: "https://example.com/remote.jpg" },
    "PATCH",
  );
  await request(
    "/auth/profile",
    400,
    a,
    { avatarUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
    "PATCH",
  );
  await request(
    "/auth/profile",
    400,
    a,
    { avatarUrl: "data:image/jpeg;base64,AAAA" },
    "PATCH",
  );
  await request("/auth/profile", 401, null, { avatarUrl: photo }, "PATCH");
  check(
    "profile edits and persisted photo; remote, executable, invalid and unauthenticated uploads rejected",
  );
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const date = new Date(Date.parse(`${today}T00:00:00Z`) + 5 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const { runs } = await request(`/fixed-loop/runs?date=${date}`, 200, a);
  const run = runs.find((row) => row.status === "scheduled");
  assert.ok(run);
  const {
    rows: [savedRun],
  } = await sql.query(
    "select id,departure_at,arrival_at,status,current_stop_index from fixed_loop_runs where id=$1",
    [run.id],
  );
  originalRun = savedRun;
  const { availableSeats } = await request(
    `/fixed-loop/runs/${run.id}/availability?pickupIndex=1&dropoffIndex=2`,
    200,
    a,
  );
  const { reservation } = await request("/fixed-loop/reservations", 201, a, {
    runId: run.id,
    pickupIndex: 1,
    dropoffIndex: 2,
    seats: [availableSeats[0]],
    standing: [],
    requestId: randomUUID(),
  });
  ticketId = reservation.id;
  const base = `/fixed-loop/reservations/${ticketId}/location-sharing`,
    map = `/fixed-loop/runs/${run.id}/passenger-locations`,
    avatar = `/fixed-loop/reservations/${ticketId}/passenger-avatar`;
  const fix = () => ({
    lat: 18.3,
    lon: 121.3,
    accuracyM: 12,
    capturedAt: new Date().toISOString(),
  });
  await request(base, 409, a, fix());
  await sql.query(
    "update fixed_loop_runs set departure_at=now()+interval '20 minutes',arrival_at=now()+interval '50 minutes',current_stop_index=0 where id=$1",
    [run.id],
  );
  assert.deepEqual((await request(map, 200, operator)).passengers, []);
  await request(base, 401, null, fix());
  await request(base, 404, b, fix());
  await request(base, 400, a, { ...fix(), lat: 91 });
  await request(base, 400, a, {
    ...fix(),
    capturedAt: new Date(Date.now() - 120_000).toISOString(),
  });
  await request(base, 400, a, {
    ...fix(),
    capturedAt: new Date(Date.now() + 120_000).toISOString(),
  });
  const first = await request(base, 201, a, fix());
  const pins = (await request(map, 200, operator)).passengers;
  assert.equal(pins.length, 1);
  assert.equal(pins[0].name, "Photo Test Passenger");
  assert.equal(pins[0].hasAvatar, true);
  assert.equal(pins[0].reservationId, ticketId);
  assert.ok(!("sharingId" in pins[0]));
  assert.equal((await request(avatar, 200, operator)).avatarUrl, photo);
  for (const actor of [a, b, admin]) {
    await request(map, 403, actor);
    await request(avatar, 403, actor);
  }
  await request(map, 401);
  await request(avatar, 401);
  await request(map, 403, otherDriver);
  await request(avatar, 403, otherDriver);
  check(
    "only the owning passenger can publish fresh valid GPS; only the assigned driver can read their pin and photo",
  );
  await request(base, 200, a, { sharingId: randomUUID() }, "DELETE");
  assert.equal((await request(map, 200, operator)).passengers.length, 1);
  await request(base, 200, a, { sharingId: first.sharingId }, "DELETE");
  assert.deepEqual((await request(map, 200, operator)).passengers, []);
  await request(avatar, 404, operator);
  await request(base, 409, a, { ...fix(), sharingId: first.sharingId }, "PUT");
  const second = await request(base, 201, a, fix());
  await request(base, 200, a, { sharingId: first.sharingId }, "DELETE");
  await request(base, 409, a, { ...fix(), sharingId: first.sharingId }, "PUT");
  assert.equal((await request(map, 200, operator)).passengers.length, 1);
  await request(base, 200, a, { ...fix(), sharingId: second.sharingId }, "PUT");
  check(
    "stop revokes the session; delayed updates cannot resurrect it or revoke a newer sharing session",
  );
  const key = `passenger:pickup:${ticketId}`;
  await redis.set(
    key,
    JSON.stringify({
      ...fix(),
      sharingId: second.sharingId,
      capturedAt: new Date(Date.now() - 46_000).toISOString(),
    }),
    "EX",
    60,
  );
  assert.deepEqual((await request(map, 200, operator)).passengers, []);
  await request(base, 200, a, { ...fix(), sharingId: second.sharingId }, "PUT");
  await sql.query(
    "update fixed_loop_reservations set status='boarded' where id=$1",
    [ticketId],
  );
  assert.deepEqual((await request(map, 200, operator)).passengers, []);
  await request(avatar, 404, operator);
  await request(base, 409, a, { ...fix(), sharingId: second.sharingId }, "PUT");
  await sql.query(
    "update fixed_loop_reservations set status='confirmed' where id=$1",
    [ticketId],
  );
  await request(base, 201, a, fix());
  await sql.query(
    "update fixed_loop_runs set current_stop_index=2 where id=$1",
    [run.id],
  );
  assert.deepEqual((await request(map, 200, operator)).passengers, []);
  await sql.query(
    "update fixed_loop_runs set current_stop_index=0 where id=$1",
    [run.id],
  );
  await redis.expire(key, 1);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepEqual((await request(map, 200, operator)).passengers, []);
  check(
    "stale points, boarding, passed pickups and Redis expiry remove live passenger pins",
  );
  await request("/auth/profile", 200, a, { avatarUrl: "" }, "PATCH");
  assert.equal((await request("/auth/profile", 200, a)).user.avatarUrl, null);
  check("passenger can remove their uploaded photo");
  console.log(
    `${passed} passenger profile/location integration groups passed.`,
  );
} finally {
  if (ticketId) {
    await redis.del(`passenger:pickup:${ticketId}`);
    await sql.query(
      "update fixed_loop_places set released_at=now() where reservation_id=$1",
      [ticketId],
    );
    await sql.query(
      "update fixed_loop_reservations set status='cancelled' where id=$1",
      [ticketId],
    );
  }
  if (originalRun)
    await sql.query(
      "update fixed_loop_runs set departure_at=$2,arrival_at=$3,status=$4,current_stop_index=$5 where id=$1",
      [
        originalRun.id,
        originalRun.departure_at,
        originalRun.arrival_at,
        originalRun.status,
        originalRun.current_stop_index,
      ],
    );
  if (originalUser)
    await sql.query("update users set full_name=$2,avatar_url=$3 where id=$1", [
      originalUser.id,
      originalUser.full_name,
      originalUser.avatar_url,
    ]);
  if (outsiderId)
    await sql.query("update users set is_active=false where id=$1", [
      outsiderId,
    ]);
  await redis.quit();
  await sql.end();
}
