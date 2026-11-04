import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { loopVehiclesTable } from "./loops";

export type FixedLoopStop = { key: string; name: string; lat?: number | null; lon?: number | null };

export const fixedLoopServicesTable = pgTable("fixed_loop_services", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  vehicleId: integer("vehicle_id").notNull().references(() => loopVehiclesTable.id).unique(),
  unitLabel: text("unit_label").notNull(),
  outboundStops: jsonb("outbound_stops").$type<FixedLoopStop[]>().notNull(),
  returnStops: jsonb("return_stops").$type<FixedLoopStop[]>().notNull(),
  enabled: boolean("enabled").notNull().default(false),
}, table => [
  check("fixed_loop_outbound_stops_check", sql`jsonb_typeof(${table.outboundStops}) = 'array' and jsonb_array_length(${table.outboundStops}) >= 2`),
  check("fixed_loop_return_stops_check", sql`jsonb_typeof(${table.returnStops}) = 'array' and jsonb_array_length(${table.returnStops}) >= 2`),
]);

export const fixedLoopRunsTable = pgTable("fixed_loop_runs", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => fixedLoopServicesTable.id),
  vehicleId: integer("vehicle_id").notNull().references(() => loopVehiclesTable.id),
  unitLabel: text("unit_label").notNull(),
  serviceDate: date("service_date", { mode: "string" }).notNull(),
  direction: text("direction").notNull(),
  departureAt: timestamp("departure_at", { withTimezone: true }).notNull(),
  arrivalAt: timestamp("arrival_at", { withTimezone: true }).notNull(),
  stops: jsonb("stops").$type<FixedLoopStop[]>().notNull(),
  status: text("status").notNull().default("scheduled"),
  currentStopIndex: integer("current_stop_index").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, table => [
  uniqueIndex("fixed_loop_runs_departure_idx").on(table.serviceId, table.departureAt),
  uniqueIndex("fixed_loop_one_active_run_idx").on(table.vehicleId).where(sql`${table.status} in ('boarding', 'on_route')`),
  index("fixed_loop_runs_date_idx").on(table.serviceId, table.serviceDate),
  check("fixed_loop_run_direction_check", sql`${table.direction} in ('to_asc', 'to_pudtol')`),
  check("fixed_loop_run_status_check", sql`${table.status} in ('scheduled', 'boarding', 'on_route', 'completed', 'cancelled')`),
  check("fixed_loop_run_times_check", sql`${table.arrivalAt} > ${table.departureAt}`),
  check("fixed_loop_run_stop_index_check", sql`${table.currentStopIndex} >= 0 and ${table.currentStopIndex} < jsonb_array_length(${table.stops})`),
]);

export const fixedLoopReservationsTable = pgTable("fixed_loop_reservations", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => fixedLoopRunsTable.id),
  passengerId: uuid("passenger_id").references(() => usersTable.id),
  bookedById: uuid("booked_by_id").notNull().references(() => usersTable.id),
  requestId: text("request_id").notNull(),
  pickupIndex: integer("pickup_index").notNull(),
  dropoffIndex: integer("dropoff_index").notNull(),
  source: text("source").notNull().default("app"),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("fixed_loop_reservation_run_id_idx").on(table.id, table.runId),
  uniqueIndex("fixed_loop_reservation_request_idx").on(table.bookedById, table.requestId),
  uniqueIndex("fixed_loop_passenger_active_run_idx").on(table.runId, table.passengerId).where(sql`${table.status} in ('confirmed', 'boarded')`),
  index("fixed_loop_reservation_passenger_idx").on(table.passengerId, table.createdAt),
  check("fixed_loop_reservation_stops_check", sql`${table.pickupIndex} >= 0 and ${table.dropoffIndex} > ${table.pickupIndex}`),
  check("fixed_loop_reservation_source_check", sql`(${table.source} = 'app' and ${table.passengerId} is not null) or (${table.source} = 'walk_in' and ${table.passengerId} is null)`),
  check("fixed_loop_reservation_status_check", sql`${table.status} in ('confirmed', 'boarded', 'completed', 'cancelled', 'no_show')`),
]);

export const fixedLoopPlacesTable = pgTable("fixed_loop_places", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull(),
  runId: integer("run_id").notNull().references(() => fixedLoopRunsTable.id),
  placeType: text("place_type").notNull(),
  placeNumber: integer("place_number").notNull(),
  segment: integer("segment").notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, table => [
  foreignKey({ columns: [table.reservationId, table.runId], foreignColumns: [fixedLoopReservationsTable.id, fixedLoopReservationsTable.runId], name: "fixed_loop_places_reservation_fk" }),
  uniqueIndex("fixed_loop_place_segment_unique_idx").on(table.runId, table.placeType, table.placeNumber, table.segment).where(sql`${table.releasedAt} is null`),
  index("fixed_loop_places_reservation_idx").on(table.reservationId),
  check("fixed_loop_place_number_check", sql`(${table.placeType} = 'seated' and ${table.placeNumber} between 1 and 19) or (${table.placeType} = 'standing' and ${table.placeNumber} between 1 and 10)`),
  check("fixed_loop_place_segment_check", sql`${table.segment} >= 0`),
]);
