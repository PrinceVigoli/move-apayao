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
    // Existing and seeded drivers remain approved by default. Public driver
    // applications explicitly set this to "pending" until an administrator
    // verifies their licence and vehicle details.
    approvalStatus: text("approval_status").notNull().default("approved"),
    // The latest administrative decision is kept on the profile for quick
    // support/reference. The immutable history lives in audit_logs.
    reviewReason: text("review_reason"),
    reviewedBy: uuid("reviewed_by").references(() => usersTable.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // A shift is the driver's explicit intent to keep receiving work. It is
    // deliberately separate from isAvailable, which becomes false while a
    // ride is assigned and returns to true only if the shift is still active.
    isOnShift: boolean("is_on_shift").notNull().default(false),
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
    approvalStatusCheck: check(
      "driver_profiles_approval_status_check",
      sql`${table.approvalStatus} in ('pending', 'approved', 'rejected', 'revoked')`,
    ),
    locationBoundsCheck: check(
      "driver_profiles_location_bounds_check",
      sql`(${table.currentLat} is null and ${table.currentLon} is null) or (${table.currentLat} between -90 and 90 and ${table.currentLon} between -180 and 180)`,
    ),
    ratingRangeCheck: check(
      "driver_profiles_rating_range_check",
      sql`${table.rating} between 0 and 5`,
    ),
    totalTripsNonnegativeCheck: check(
      "driver_profiles_total_trips_nonnegative_check",
      sql`${table.totalTrips} >= 0`,
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
