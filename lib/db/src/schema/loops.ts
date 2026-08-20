import {
  pgTable,
  serial,
  text,
  uuid,
  boolean,
  doublePrecision,
  timestamp,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const loopRoutesTable = pgTable("loop_routes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  baseFare: doublePrecision("base_fare").notNull().default(0),
  distanceKm: doublePrecision("distance_km"),
  routeDurationSeconds: integer("route_duration_seconds"),
  routePolyline: text("route_polyline"),
  distanceSource: text("distance_source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loopStopsTable = pgTable(
  "loop_stops",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id")
      .notNull()
      .references(() => loopRoutesTable.id),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    routeIdx: index("loop_stops_route_id_idx").on(table.routeId),
    routeSequenceIdx: uniqueIndex("loop_stops_route_sequence_idx").on(table.routeId, table.sequence),
    sequencePositiveCheck: check("loop_stops_sequence_positive_check", sql`${table.sequence} > 0`),
    coordinatesCheck: check(
      "loop_stops_coordinates_check",
      sql`${table.lat} between -90 and 90 and ${table.lon} between -180 and 180`,
    ),
  }),
);

export const loopVehiclesTable = pgTable(
  "loop_vehicles",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id")
      .notNull()
      .references(() => loopRoutesTable.id),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull().default("idle"), // idle | on_route | off_duty
    currentLat: doublePrecision("current_lat"),
    currentLon: doublePrecision("current_lon"),
    currentStopId: integer("current_stop_id").references(() => loopStopsTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    routeIdx: index("loop_vehicles_route_id_idx").on(table.routeId),
    driverIdx: uniqueIndex("loop_vehicles_driver_id_idx").on(table.driverId),
    statusCheck: check(
      "loop_vehicles_status_check",
      sql`${table.status} in ('idle', 'on_route', 'off_duty')`,
    ),
    coordinatesCheck: check(
      "loop_vehicles_coordinates_check",
      sql`(${table.currentLat} is null and ${table.currentLon} is null) or (${table.currentLat} between -90 and 90 and ${table.currentLon} between -180 and 180)`,
    ),
  }),
);

export const insertLoopRouteSchema = createInsertSchema(loopRoutesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLoopRoute = z.infer<typeof insertLoopRouteSchema>;
export type LoopRoute = typeof loopRoutesTable.$inferSelect;

export const insertLoopStopSchema = createInsertSchema(loopStopsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLoopStop = z.infer<typeof insertLoopStopSchema>;
export type LoopStop = typeof loopStopsTable.$inferSelect;

export const insertLoopVehicleSchema = createInsertSchema(loopVehiclesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertLoopVehicle = z.infer<typeof insertLoopVehicleSchema>;
export type LoopVehicle = typeof loopVehiclesTable.$inferSelect;
