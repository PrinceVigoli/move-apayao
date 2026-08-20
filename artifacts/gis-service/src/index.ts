import { timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, gisAuditEventsTable, gisRouteCandidatesTable } from "@workspace/db";
import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";
const configuredServiceToken =
  process.env.GIS_SERVICE_TOKEN ?? (!isProduction ? process.env.JWT_SECRET : undefined);
if (!configuredServiceToken || configuredServiceToken.length < 32) {
  throw new Error(
    "GIS_SERVICE_TOKEN must be configured with at least 32 characters (local development may reuse JWT_SECRET)",
  );
}
const serviceToken: string = configuredServiceToken;
if (!process.env.GIS_SERVICE_TOKEN && !isProduction) {
  console.warn("GIS_SERVICE_TOKEN is unset; using JWT_SECRET for local development only");
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

function internalOnly(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.header("x-gis-service-token") ?? "";
  const expectedBytes = Buffer.from(serviceToken);
  const suppliedBytes = Buffer.from(supplied);
  const valid =
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized internal service request" });
    return;
  }
  next();
}

async function audit(req: Request, action: string, metadata?: Record<string, unknown>) {
  const actor = req.header("x-gis-actor-id");
  await db.insert(gisAuditEventsTable).values({
    actorUserId: actor && z.string().uuid().safeParse(actor).success ? actor : null,
    action,
    metadata,
  });
}

app.get("/healthz", async (_req, res) => {
  try {
    const result = await db.execute(sql`select PostGIS_Version() as postgis_version`);
    res.json({ status: "ok", postgisVersion: result.rows[0]?.postgis_version ?? null });
  } catch {
    res.status(503).json({ status: "degraded", postgisVersion: null });
  }
});

app.use("/internal", internalOnly);

app.get("/internal/overview", async (req, res) => {
  const result = await db.execute(sql`
    select
      count(*)::int as total_points,
      count(*) filter (where captured_at >= now() - interval '24 hours')::int as points_24h,
      count(distinct driver_id) filter (where captured_at >= now() - interval '24 hours')::int as active_drivers_24h,
      count(*) filter (
        where not is_mocked and (accuracy_m is null or accuracy_m <= 100)
      )::int as valid_points,
      count(*) filter (where is_mocked)::int as mocked_points,
      count(*) filter (where accuracy_m > 100)::int as low_accuracy_points,
      round(avg(accuracy_m) filter (
        where captured_at >= now() - interval '24 hours'
          and not is_mocked and accuracy_m between 0 and 100
      )::numeric, 1)::float as average_accuracy_m,
      max(captured_at) as latest_point_at
    from driver_location_points
  `);
  const candidateResult = await db.execute(sql`
    select
      count(*)::int as total_candidates,
      count(*) filter (where status = 'draft')::int as draft_candidates,
      count(*) filter (where status = 'approved')::int as approved_candidates
    from gis_route_candidates
  `);
  const row = result.rows[0] as Record<string, number> | undefined;
  const candidates = candidateResult.rows[0] as Record<string, number> | undefined;
  await audit(req, "gis.overview.viewed");
  res.json({
    totalPoints: row?.total_points ?? 0,
    points24h: row?.points_24h ?? 0,
    activeDrivers24h: row?.active_drivers_24h ?? 0,
    validPoints: row?.valid_points ?? 0,
    mockedPoints: row?.mocked_points ?? 0,
    lowAccuracyPoints: row?.low_accuracy_points ?? 0,
    averageAccuracyM: row?.average_accuracy_m ?? null,
    latestPointAt: row?.latest_point_at ?? null,
    qualityScore:
      (row?.total_points ?? 0) > 0
        ? Math.round(((row?.valid_points ?? 0) / (row?.total_points ?? 1)) * 100)
        : 0,
    totalCandidates: candidates?.total_candidates ?? 0,
    draftCandidates: candidates?.draft_candidates ?? 0,
    approvedCandidates: candidates?.approved_candidates ?? 0,
    generatedAt: new Date().toISOString(),
  });
});

const RecentTracksQuery = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

app.get("/internal/tracks/recent", async (req, res) => {
  const parsed = RecentTracksQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid track query" });
    return;
  }
  const { hours, limit } = parsed.data;
  const result = await db.execute(sql`
    with quality_points as (
      select
        p.*,
        lag(p.captured_at) over (
          partition by p.driver_id, p.trip_id
          order by p.captured_at
        ) as previous_captured_at
      from driver_location_points p
      where p.captured_at >= now() - make_interval(hours => ${hours})
        and not p.is_mocked
        and (p.accuracy_m is null or p.accuracy_m <= 100)
        and (p.speed_mps is null or p.speed_mps between 0 and 45)
    ), marked_points as (
      select
        quality_points.*,
        case
          when previous_captured_at is null
            or captured_at - previous_captured_at > interval '10 minutes'
          then 1 else 0
        end as starts_new_session
      from quality_points
    ), sessionized_points as (
      select
        marked_points.*,
        sum(starts_new_session) over (
          partition by driver_id, trip_id
          order by captured_at
        ) as track_session
      from marked_points
    )
    select
      p.driver_id,
      u.full_name,
      p.trip_id,
      p.track_session,
      count(*)::int as point_count,
      min(p.captured_at) as started_at,
      max(p.captured_at) as ended_at,
      ST_AsGeoJSON(
        ST_Simplify(ST_MakeLine(p.position order by p.captured_at), 0.00002),
        6
      ) as geometry
    from sessionized_points p
    join users u on u.id = p.driver_id
    group by p.driver_id, u.full_name, p.trip_id, p.track_session
    having count(*) >= 2
    order by max(p.captured_at) desc
    limit ${limit}
  `);
  const features = result.rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      type: "Feature" as const,
      geometry: JSON.parse(String(row.geometry)),
      properties: {
        driverId: row.driver_id,
        driverName: row.full_name,
        tripId: row.trip_id,
        trackSession: row.track_session,
        pointCount: row.point_count,
        startedAt: row.started_at,
        endedAt: row.ended_at,
      },
    };
  });
  await audit(req, "gis.tracks.viewed", { hours, limit, returned: features.length });
  res.json({ type: "FeatureCollection", features, generatedAt: new Date().toISOString() });
});

app.get("/internal/candidates", async (req, res) => {
  const candidates = await db
    .select()
    .from(gisRouteCandidatesTable)
    .orderBy(desc(gisRouteCandidatesTable.createdAt))
    .limit(100);
  await audit(req, "gis.candidates.viewed", { returned: candidates.length });
  res.json({ candidates });
});

const GenerateCandidatesBody = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

app.post("/internal/candidates/generate", async (req, res) => {
  const parsed = GenerateCandidatesBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid candidate generation request" });
    return;
  }

  const { days } = parsed.data;
  const result = await db.execute(sql`
    with quality_points as (
      select
        p.*,
        lag(p.captured_at) over (
          partition by p.driver_id, p.trip_id
          order by p.captured_at
        ) as previous_captured_at
      from driver_location_points p
      where p.captured_at >= date_trunc('day', now()) - make_interval(days => ${days})
        and not p.is_mocked
        and (p.accuracy_m is null or p.accuracy_m <= 50)
        and (p.speed_mps is null or p.speed_mps between 0 and 45)
    ), marked_points as (
      select
        quality_points.*,
        case
          when previous_captured_at is null
            or captured_at - previous_captured_at > interval '10 minutes'
          then 1 else 0
        end as starts_new_session
      from quality_points
    ), sessionized_points as (
      select
        marked_points.*,
        sum(starts_new_session) over (
          partition by driver_id, trip_id
          order by captured_at
        ) as track_session
      from marked_points
    ), tracks as (
      select
        driver_id,
        trip_id,
        track_session,
        count(*)::int as point_count,
        min(captured_at) as started_at,
        max(captured_at) as ended_at,
        ST_Simplify(ST_MakeLine(position order by captured_at), 0.00002) as route_line
      from sessionized_points
      group by driver_id, trip_id, track_session
      having count(*) >= 8
        and max(captured_at) - min(captured_at) >= interval '2 minutes'
    ), eligible_tracks as (
      select
        tracks.*,
        ST_Length(route_line::geography) / 1000.0 as distance_km,
        least(
          ST_GeoHash(ST_StartPoint(route_line), 6),
          ST_GeoHash(ST_EndPoint(route_line), 6)
        ) || ':' || greatest(
          ST_GeoHash(ST_StartPoint(route_line), 6),
          ST_GeoHash(ST_EndPoint(route_line), 6)
        ) as corridor_key
      from tracks
      where ST_Length(route_line::geography) between 500 and 100000
    ), corridor_stats as (
      select
        corridor_key,
        count(*)::int as supporting_runs,
        count(distinct driver_id)::int as supporting_drivers,
        min(started_at) as source_window_start,
        max(ended_at) as source_window_end
      from eligible_tracks
      group by corridor_key
      having count(*) >= 3 and count(distinct driver_id) >= 2
    ), representatives as (
      select distinct on (corridor_key)
        corridor_key,
        route_line,
        distance_km,
        point_count
      from eligible_tracks
      order by corridor_key, point_count desc, ended_at desc
    )
    select
      s.corridor_key,
      s.supporting_runs,
      s.supporting_drivers,
      s.source_window_start,
      s.source_window_end,
      r.distance_km,
      ST_AsGeoJSON(r.route_line, 6)::json as geometry
    from corridor_stats s
    join representatives r using (corridor_key)
    order by s.supporting_runs desc, s.supporting_drivers desc
    limit 25
  `);

  const suppliedActor = req.header("x-gis-actor-id");
  const actorUserId =
    suppliedActor && z.string().uuid().safeParse(suppliedActor).success ? suppliedActor : null;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of result.rows) {
    const row = raw as Record<string, unknown>;
    const name = `Observed corridor ${String(row.corridor_key).toUpperCase()}`;
    const [existing] = await db
      .select()
      .from(gisRouteCandidatesTable)
      .where(eq(gisRouteCandidatesTable.name, name))
      .orderBy(desc(gisRouteCandidatesTable.createdAt))
      .limit(1);
    const supportingRuns = Number(row.supporting_runs);
    const supportingDrivers = Number(row.supporting_drivers);
    const confidence = Math.min(0.95, 0.35 + supportingRuns * 0.08 + supportingDrivers * 0.07);
    const candidate = {
      geometryGeoJson: row.geometry as Record<string, unknown>,
      supportingRuns,
      supportingDrivers,
      confidence,
      distanceKm: Number(row.distance_km),
      sourceWindowStart: new Date(String(row.source_window_start)),
      sourceWindowEnd: new Date(String(row.source_window_end)),
    };

    if (!existing) {
      await db.insert(gisRouteCandidatesTable).values({
        name,
        ...candidate,
        createdBy: actorUserId,
      });
      created += 1;
    } else if (existing.status === "draft" || existing.status === "reviewing") {
      await db
        .update(gisRouteCandidatesTable)
        .set(candidate)
        .where(eq(gisRouteCandidatesTable.id, existing.id));
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  await audit(req, "gis.candidates.generated", {
    days,
    eligibleCorridors: result.rows.length,
    created,
    updated,
    skipped,
  });
  res.json({ days, eligibleCorridors: result.rows.length, created, updated, skipped });
});

const ReviewCandidateBody = z.object({
  status: z.enum(["reviewing", "approved", "rejected"]),
  reason: z.string().trim().min(5).max(500),
});

app.patch("/internal/candidates/:id/review", async (req, res) => {
  const candidateId = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = ReviewCandidateBody.safeParse(req.body ?? {});
  const suppliedActor = req.header("x-gis-actor-id");
  const actor = z.string().uuid().safeParse(suppliedActor);
  if (!candidateId.success || !parsed.success || !actor.success) {
    res.status(400).json({ error: "A candidate, authenticated actor, status, and review reason are required" });
    return;
  }

  const [candidate] = await db
    .select()
    .from(gisRouteCandidatesTable)
    .where(eq(gisRouteCandidatesTable.id, candidateId.data));
  if (!candidate) {
    res.status(404).json({ error: "GIS route candidate not found" });
    return;
  }
  if (candidate.status === "approved" || candidate.status === "rejected") {
    res.status(409).json({ error: `Candidate is already ${candidate.status}` });
    return;
  }

  const [updated] = await db
    .update(gisRouteCandidatesTable)
    .set({
      status: parsed.data.status,
      reviewedBy: actor.data,
      reviewReason: parsed.data.reason,
      reviewedAt: new Date(),
    })
    .where(eq(gisRouteCandidatesTable.id, candidate.id))
    .returning();
  await audit(req, `gis.candidate.${parsed.data.status}`, {
    candidateId: candidate.id,
    previousStatus: candidate.status,
    reason: parsed.data.reason,
  });
  res.json({ candidate: updated });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("GIS service error", err);
  if (!res.headersSent) res.status(500).json({ error: "GIS service error" });
});

const rawPointRetentionDays = Number(process.env.GIS_RAW_POINT_RETENTION_DAYS ?? 180);
const retentionDays = Number.isFinite(rawPointRetentionDays)
  ? Math.min(730, Math.max(30, Math.floor(rawPointRetentionDays)))
  : 180;

async function purgeExpiredLocationHistory(): Promise<void> {
  try {
    const result = await db.execute(sql`
      delete from driver_location_points
      where captured_at < now() - make_interval(days => ${retentionDays})
    `);
    console.log("GIS retention pass completed", { retentionDays, removed: result.rowCount ?? 0 });
  } catch (err) {
    console.error("GIS retention pass failed", err);
  }
}

const port = Number(process.env.GIS_SERVICE_PORT ?? (isProduction ? process.env.PORT : undefined) ?? 5100);
const host = process.env.GIS_SERVICE_HOST ?? (isProduction ? process.env.HOST : undefined) ?? "127.0.0.1";
app.listen(port, host, () => {
  console.log(`GIS Intelligence service listening on http://${host}:${port}`);
  void purgeExpiredLocationHistory();
  const retentionTimer = setInterval(() => void purgeExpiredLocationHistory(), 24 * 60 * 60 * 1000);
  retentionTimer.unref();
});
