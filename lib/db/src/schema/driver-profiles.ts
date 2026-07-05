import {
  pgTable,
  serial,
  text,
  uuid,
  boolean,
  doublePrecision,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const driverProfilesTable = pgTable("driver_profiles", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id),
  vehicleType: text("vehicle_type").notNull().default("e-trike"), // e-trike, jeepney, etc.
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
});

export const insertDriverProfileSchema = createInsertSchema(driverProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDriverProfile = z.infer<typeof insertDriverProfileSchema>;
export type DriverProfile = typeof driverProfilesTable.$inferSelect;
