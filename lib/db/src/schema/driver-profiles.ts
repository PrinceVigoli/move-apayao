import {
  pgTable,
  serial,
  text,
  uuid,
  boolean,
  doublePrecision,
  timestamp,
  integer,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const driverProfilesTable = pgTable(
  "driver_profiles",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => usersTable.id),
    vehicleType: text("vehicle_type").notNull().default("e-trike"), // e-trike, jeepney, etc.
    // Total passenger seats this vehicle can carry. Defaults are assigned at
    // registration based on vehicleType (see lib/vehicle-capacity.ts in the
    // API server) but can be overridden per-driver — e.g. two "jeepney"
    // drivers might run different-sized units.
    capacity: integer("capacity").notNull().default(4),
    licenseNumber: text("license_number"),
    plateNumber: text("plate_number"),
    vehicleColor: text("vehicle_color"),
    isAvailable: boolean("is_available").notNull().default(false),
    currentLat: doublePrecision("current_lat"),
    currentLon: doublePrecision("current_lon"),
    lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
    rating: doublePrecision("rating").notNull().default(0),
    totalTrips: integer("total_trips").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    capacityPositiveCheck: check(
      "driver_profiles_capacity_positive_check",
      sql`${table.capacity} > 0`,
    ),
  }),
);

export const insertDriverProfileSchema = createInsertSchema(driverProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDriverProfile = z.infer<typeof insertDriverProfileSchema>;
export type DriverProfile = typeof driverProfilesTable.$inferSelect;
