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
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { farePoliciesTable } from "./fare-policies";
import { fleetVehiclesTable } from "./vehicles";

export const tripsTable = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => usersTable.id),
    driverId: uuid("driver_id").references(() => usersTable.id),
    vehicleId: uuid("vehicle_id").references(() => fleetVehiclesTable.id, {
      onDelete: "set null",
    }),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLon: doublePrecision("pickup_lon").notNull(),
    pickupAddress: text("pickup_address"),
    dropoffLat: doublePrecision("dropoff_lat").notNull(),
    dropoffLon: doublePrecision("dropoff_lon").notNull(),
    dropoffAddress: text("dropoff_address"),
    // Seats requested for this booking (group booking — one passenger books
    // for their party). Matching only claims a driver whose vehicle
    // capacity can fit this many people; fare scales with it too.
    passengerCount: integer("passenger_count").notNull().default(1),
    // A client-generated key makes booking retries idempotent. Mobile
    // connections commonly drop after the server has committed a request;
    // retrying with the same key must return the original trip, not create a
    // second booking.
    clientRequestId: text("client_request_id"),
    // requested -> matched (offered) -> accepted -> arrived -> in_progress
    // -> completed | cancelled
    // "completing" is a transient claim-lock used only inside the
    // /trips/:id/complete transaction; it is never committed on its own,
    // so it is never visible to a reader outside that transaction.
    status: text("status").notNull().default("requested"),
    fareAmount: doublePrecision("fare_amount"),
    farePolicyId: integer("fare_policy_id").references(() => farePoliciesTable.id),
    distanceKm: doublePrecision("distance_km"),
    routeDurationSeconds: integer("route_duration_seconds"),
    routePolyline: text("route_polyline"),
    distanceSource: text("distance_source"),
    cancelReason: text("cancel_reason"),
    cancelReasonCode: text("cancel_reason_code"),
    cancelDetails: text("cancel_details"),
    cancelledBy: uuid("cancelled_by").references(() => usersTable.id),
    pickupCode: text("pickup_code"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    passengerIdx: index("trips_passenger_id_idx").on(table.passengerId),
    driverIdx: index("trips_driver_id_idx").on(table.driverId),
    vehicleIdx: index("trips_vehicle_id_idx").on(table.vehicleId),
    // Supports "WHERE passenger_id = ? ORDER BY created_at DESC" / same for driver
    passengerCreatedIdx: index("trips_passenger_created_idx").on(
      table.passengerId,
      table.createdAt,
    ),
    driverCreatedIdx: index("trips_driver_created_idx").on(table.driverId, table.createdAt),
    statusIdx: index("trips_status_idx").on(table.status),
    clientRequestUniqueIdx: uniqueIndex("trips_client_request_id_unique_idx").on(
      table.passengerId,
      table.clientRequestId,
    ),
    // Belt-and-suspenders against double-booking a driver: even if
    // application logic (matching, decline-rematch, etc.) ever has a bug,
    // Postgres itself refuses a second row that would give one driver two
    // simultaneously "live" trips. NULLs (trips with no driver yet, e.g.
    // status = 'requested') never conflict with each other or with this
    // index, since a partial index only covers rows matching the WHERE.
    activeDriverUniqueIdx: uniqueIndex("trips_active_driver_unique_idx")
      .on(table.driverId)
      .where(sql`${table.status} in ('matched', 'accepted', 'arrived', 'in_progress')`),
    activePassengerUniqueIdx: uniqueIndex("trips_active_passenger_unique_idx")
      .on(table.passengerId)
      .where(
        sql`${table.status} in ('requested', 'matched', 'accepted', 'arrived', 'in_progress')`,
      ),
    passengerCountPositiveCheck: check(
      "trips_passenger_count_positive_check",
      sql`${table.passengerCount} between 1 and 15`,
    ),
    coordinatesCheck: check(
      "trips_coordinates_check",
      sql`${table.pickupLat} between -90 and 90 and ${table.dropoffLat} between -90 and 90 and ${table.pickupLon} between -180 and 180 and ${table.dropoffLon} between -180 and 180`,
    ),
    fareNonnegativeCheck: check(
      "trips_fare_nonnegative_check",
      sql`${table.fareAmount} is null or ${table.fareAmount} >= 0`,
    ),
    distanceNonnegativeCheck: check(
      "trips_distance_nonnegative_check",
      sql`${table.distanceKm} is null or ${table.distanceKm} >= 0`,
    ),
    statusCheck: check(
      "trips_status_check",
      sql`${table.status} in ('requested', 'matched', 'accepted', 'arrived', 'in_progress', 'completing', 'completed', 'cancelled')`,
    ),
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
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tripIdx: index("trip_ratings_trip_id_idx").on(table.tripId),
    rateeIdx: index("trip_ratings_ratee_id_idx").on(table.rateeId),
    // Application checks improve the error message; this constraint is what
    // prevents duplicate ratings when two requests arrive concurrently.
    tripRaterUniqueIdx: uniqueIndex("trip_ratings_trip_rater_unique_idx").on(
      table.tripId,
      table.raterId,
    ),
    ratingRangeCheck: check(
      "trip_ratings_rating_range_check",
      sql`${table.rating} between 1 and 5`,
    ),
    differentUsersCheck: check(
      "trip_ratings_different_users_check",
      sql`${table.raterId} <> ${table.rateeId}`,
    ),
  }),
);

export const insertTripSchema = createInsertSchema(tripsTable).omit({
  id: true,
  createdAt: true,
  driverId: true,
  vehicleId: true,
  status: true,
  fareAmount: true,
  farePolicyId: true,
  distanceKm: true,
  routeDurationSeconds: true,
  routePolyline: true,
  distanceSource: true,
  pickupCode: true,
  matchedAt: true,
  offerExpiresAt: true,
  acceptedAt: true,
  arrivedAt: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelReason: true,
  cancelReasonCode: true,
  cancelDetails: true,
  cancelledBy: true,
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
