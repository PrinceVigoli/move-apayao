import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  geometry,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

/**
 * Canonical fleet records for point-to-point operations. A vehicle exists
 * independently of a driver or GPS tracker because both assignments can
 * change over the lifetime of the vehicle.
 */
export const fleetVehiclesTable = pgTable(
  "fleet_vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plateNumber: text("plate_number").notNull().unique(),
    label: text("label"),
    vehicleType: text("vehicle_type").notNull().default("e-jeepney"),
    capacity: integer("capacity").notNull().default(15),
    isActive: boolean("is_active").notNull().default(true),
    currentLat: doublePrecision("current_lat"),
    currentLon: doublePrecision("current_lon"),
    lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index("fleet_vehicles_active_idx").on(table.isActive),
    capacityCheck: check("fleet_vehicles_capacity_check", sql`${table.capacity} between 1 and 100`),
    coordinatesCheck: check(
      "fleet_vehicles_coordinates_check",
      sql`(${table.currentLat} is null and ${table.currentLon} is null) or (${table.currentLat} between -90 and 90 and ${table.currentLon} between -180 and 180)`,
    ),
  }),
);

/** Time-bounded driver-to-vehicle assignments preserve historical truth. */
export const vehicleDriverAssignmentsTable = pgTable(
  "vehicle_driver_assignments",
  {
    id: serial("id").primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehiclesTable.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  },
  (table) => ({
    vehicleIdx: index("vehicle_driver_assignments_vehicle_idx").on(table.vehicleId),
    driverIdx: index("vehicle_driver_assignments_driver_idx").on(table.driverId),
    oneActiveDriverPerVehicle: uniqueIndex("vehicle_driver_assignments_active_vehicle_idx")
      .on(table.vehicleId)
      .where(sql`${table.unassignedAt} is null`),
    oneActiveVehiclePerDriver: uniqueIndex("vehicle_driver_assignments_active_driver_idx")
      .on(table.driverId)
      .where(sql`${table.unassignedAt} is null`),
    dateOrderCheck: check(
      "vehicle_driver_assignments_date_order_check",
      sql`${table.unassignedAt} is null or ${table.unassignedAt} >= ${table.assignedAt}`,
    ),
  }),
);

/**
 * Hardware-neutral GPS identity. Only a SHA-256 token hash is stored; the raw
 * provisioning token is returned once and belongs in the device/vendor vault.
 */
export const gpsDevicesTable = pgTable(
  "gps_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").notNull().unique(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehiclesTable.id, { onDelete: "cascade" }),
    label: text("label"),
    protocol: text("protocol").notNull().default("https_json_v1"),
    tokenHash: text("token_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastBatteryPercent: doublePrecision("last_battery_percent"),
    lastSignalDbm: doublePrecision("last_signal_dbm"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vehicleIdx: index("gps_devices_vehicle_idx").on(table.vehicleId),
    oneActiveDevicePerVehicle: uniqueIndex("gps_devices_active_vehicle_idx")
      .on(table.vehicleId)
      .where(sql`${table.isActive} = true`),
    batteryCheck: check(
      "gps_devices_battery_check",
      sql`${table.lastBatteryPercent} is null or ${table.lastBatteryPercent} between 0 and 100`,
    ),
  }),
);

/** Durable raw vehicle telemetry; Redis remains the live delivery layer. */
export const vehicleLocationPointsTable = pgTable(
  "vehicle_location_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehiclesTable.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => gpsDevicesTable.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id").references(() => usersTable.id, { onDelete: "set null" }),
    eventId: text("event_id").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    position: geometry("position", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    speedMps: doublePrecision("speed_mps"),
    headingDegrees: doublePrecision("heading_degrees"),
    batteryPercent: doublePrecision("battery_percent"),
    signalDbm: doublePrecision("signal_dbm"),
  },
  (table) => ({
    vehicleTimeIdx: index("vehicle_location_points_vehicle_time_idx").on(
      table.vehicleId,
      table.capturedAt,
    ),
    positionIdx: index("vehicle_location_points_position_gist_idx").using("gist", table.position),
    eventUnique: uniqueIndex("vehicle_location_points_device_event_idx").on(
      table.deviceId,
      table.eventId,
    ),
    accuracyCheck: check(
      "vehicle_location_points_accuracy_check",
      sql`${table.accuracyM} is null or ${table.accuracyM} between 0 and 10000`,
    ),
    speedCheck: check(
      "vehicle_location_points_speed_check",
      sql`${table.speedMps} is null or ${table.speedMps} between 0 and 100`,
    ),
    headingCheck: check(
      "vehicle_location_points_heading_check",
      sql`${table.headingDegrees} is null or (${table.headingDegrees} >= 0 and ${table.headingDegrees} < 360)`,
    ),
    batteryCheck: check(
      "vehicle_location_points_battery_check",
      sql`${table.batteryPercent} is null or ${table.batteryPercent} between 0 and 100`,
    ),
  }),
);

export type FleetVehicle = typeof fleetVehiclesTable.$inferSelect;
export type GpsDevice = typeof gpsDevicesTable.$inferSelect;
export type VehicleLocationPoint = typeof vehicleLocationPointsTable.$inferSelect;
