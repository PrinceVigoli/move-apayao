import {
  pgTable,
  serial,
  text,
  uuid,
  doublePrecision,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const tripsTable = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => usersTable.id),
    driverId: uuid("driver_id").references(() => usersTable.id),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLon: doublePrecision("pickup_lon").notNull(),
    pickupAddress: text("pickup_address"),
    dropoffLat: doublePrecision("dropoff_lat").notNull(),
    dropoffLon: doublePrecision("dropoff_lon").notNull(),
    dropoffAddress: text("dropoff_address"),
    // requested -> matched -> in_progress -> completed | cancelled
    // "completing" is a transient claim-lock used only inside the
    // /trips/:id/complete transaction; it is never committed on its own,
    // so it is never visible to a reader outside that transaction.
    status: text("status").notNull().default("requested"),
    fareAmount: doublePrecision("fare_amount"),
    distanceKm: doublePrecision("distance_km"),
    cancelReason: text("cancel_reason"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    passengerIdx: index("trips_passenger_id_idx").on(table.passengerId),
    driverIdx: index("trips_driver_id_idx").on(table.driverId),
    // Supports "WHERE passenger_id = ? ORDER BY created_at DESC" / same for driver
    passengerCreatedIdx: index("trips_passenger_created_idx").on(
      table.passengerId,
      table.createdAt,
    ),
    driverCreatedIdx: index("trips_driver_created_idx").on(table.driverId, table.createdAt),
    statusIdx: index("trips_status_idx").on(table.status),
    // Belt-and-suspenders against double-booking a driver: even if
    // application logic (matching, decline-rematch, etc.) ever has a bug,
    // Postgres itself refuses a second row that would give one driver two
    // simultaneously "live" trips. NULLs (trips with no driver yet, e.g.
    // status = 'requested') never conflict with each other or with this
    // index, since a partial index only covers rows matching the WHERE.
    activeDriverUniqueIdx: uniqueIndex("trips_active_driver_unique_idx")
      .on(table.driverId)
      .where(sql`${table.status} in ('matched', 'in_progress')`),
  }),
);

export const tripRatingsTable = pgTable(
  "trip_ratings",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => tripsTable.id),
    raterId: uuid("rater_id")
      .notNull()
      .references(() => usersTable.id),
    rateeId: uuid("ratee_id")
      .notNull()
      .references(() => usersTable.id),
    rating: integer("rating").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tripIdx: index("trip_ratings_trip_id_idx").on(table.tripId),
    rateeIdx: index("trip_ratings_ratee_id_idx").on(table.rateeId),
  }),
);

export const insertTripSchema = createInsertSchema(tripsTable).omit({
  id: true,
  createdAt: true,
  driverId: true,
  status: true,
  fareAmount: true,
  distanceKm: true,
  matchedAt: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelReason: true,
});
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;

export const insertTripRatingSchema = createInsertSchema(tripRatingsTable).omit({
  id: true,
  createdAt: true,
  raterId: true,
  rateeId: true,
});
export type InsertTripRating = z.infer<typeof insertTripRatingSchema>;
export type TripRating = typeof tripRatingsTable.$inferSelect;