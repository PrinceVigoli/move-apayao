import {
  bigserial,
  boolean,
  doublePrecision,
  geometry,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { tripsTable } from "./trips";
import { loopRoutesTable } from "./loops";

/**
 * Raw, system-owned GPS observations. Redis remains the live-location store;
 * this table is the durable GIS history used for route learning and audits.
 */
export const driverLocationPointsTable = pgTable(
  "driver_location_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tripId: integer("trip_id").references(() => tripsTable.id, { onDelete: "set null" }),
    loopRouteId: integer("loop_route_id").references(() => loopRoutesTable.id, {
      onDelete: "set null",
    }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    position: geometry("position", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    speedMps: doublePrecision("speed_mps"),
    headingDegrees: doublePrecision("heading_degrees"),
    devicePointId: text("device_point_id"),
    source: text("source").notNull().default("driver_app"),
    isMocked: boolean("is_mocked").notNull().default(false),
  },
  (table) => ({
    driverTimeIdx: index("driver_location_points_driver_time_idx").on(
      table.driverId,
      table.capturedAt,
    ),
    tripTimeIdx: index("driver_location_points_trip_time_idx").on(table.tripId, table.capturedAt),
    positionIdx: index("driver_location_points_position_gist_idx").using("gist", table.position),
    devicePointUnique: uniqueIndex("driver_location_points_device_point_unique").on(
      table.driverId,
      table.devicePointId,
    ),
    accuracyCheck: check("driver_location_points_accuracy_check", sql`${table.accuracyM} is null or ${table.accuracyM} >= 0`),
    speedCheck: check("driver_location_points_speed_check", sql`${table.speedMps} is null or ${table.speedMps} >= 0`),
    headingCheck: check("driver_location_points_heading_check", sql`${table.headingDegrees} is null or (${table.headingDegrees} >= 0 and ${table.headingDegrees} < 360)`),
  }),
);

/** Candidate geometries stay isolated from operational loop routes until a
 * privileged reviewer explicitly publishes a version. */
export const gisRouteCandidatesTable = pgTable(
  "gis_route_candidates",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    geometryGeoJson: jsonb("geometry_geojson").notNull(),
    supportingRuns: integer("supporting_runs").notNull().default(0),
    supportingDrivers: integer("supporting_drivers").notNull().default(0),
    confidence: doublePrecision("confidence").notNull().default(0),
    distanceKm: doublePrecision("distance_km"),
    sourceWindowStart: timestamp("source_window_start", { withTimezone: true }),
    sourceWindowEnd: timestamp("source_window_end", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("gis_route_candidates_status_idx").on(table.status),
    createdIdx: index("gis_route_candidates_created_at_idx").on(table.createdAt),
    statusCheck: check("gis_route_candidates_status_check", sql`${table.status} in ('draft', 'reviewing', 'approved', 'rejected', 'published')`),
    supportingRunsCheck: check("gis_route_candidates_supporting_runs_check", sql`${table.supportingRuns} >= 0`),
    supportingDriversCheck: check("gis_route_candidates_supporting_drivers_check", sql`${table.supportingDrivers} >= 0`),
    confidenceCheck: check("gis_route_candidates_confidence_check", sql`${table.confidence} >= 0 and ${table.confidence} <= 1`),
    distanceCheck: check("gis_route_candidates_distance_check", sql`${table.distanceKm} is null or ${table.distanceKm} >= 0`),
    sourceWindowCheck: check("gis_route_candidates_source_window_check", sql`${table.sourceWindowStart} is null or ${table.sourceWindowEnd} is null or ${table.sourceWindowEnd} >= ${table.sourceWindowStart}`),
  }),
);

/** Separate audit stream so provincial audit views do not reveal the hidden
 * GIS module or its privileged activity. */
export const gisAuditEventsTable = pgTable(
  "gis_audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actorIdx: index("gis_audit_events_actor_idx").on(table.actorUserId),
    createdIdx: index("gis_audit_events_created_idx").on(table.createdAt),
  }),
);

export type DriverLocationPoint = typeof driverLocationPointsTable.$inferSelect;
export type GisRouteCandidate = typeof gisRouteCandidatesTable.$inferSelect;
