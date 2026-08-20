import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  driverProfilesTable,
  gpsDevicesTable,
  gisRouteCandidatesTable,
  loopStopsTable,
  subscriptionsTable,
  tripRatingsTable,
  tripsTable,
  vehicleDriverAssignmentsTable,
  vehicleLocationPointsTable,
} from "@workspace/db";
import { RegisterBody } from "./auth";
import { canAccessAnyRole, hasProvincialAdminAccess } from "../middlewares/auth";

const baseRegistration = {
  email: "person@example.com",
  password: "a sufficiently long password",
  fullName: "Test Person",
  acceptedTerms: true as const,
};

test("public registration cannot grant privileged roles", () => {
  assert.equal(RegisterBody.safeParse({ ...baseRegistration, role: "driver" }).success, false);
  assert.equal(RegisterBody.safeParse({ ...baseRegistration, role: "admin" }).success, false);
  assert.equal(RegisterBody.safeParse({ ...baseRegistration, role: "superadmin" }).success, false);
  assert.equal(RegisterBody.safeParse({ ...baseRegistration, role: "developer" }).success, false);
});

test("only admin and superadmin inherit provincial administration access", () => {
  assert.equal(hasProvincialAdminAccess("admin"), true);
  assert.equal(hasProvincialAdminAccess("superadmin"), true);
  assert.equal(hasProvincialAdminAccess("developer"), false);
  assert.equal(hasProvincialAdminAccess("driver"), false);
});

test("GIS roles exclude provincial admins while superadmins inherit admin access", () => {
  const gisRoles = ["developer", "superadmin"];
  assert.equal(canAccessAnyRole("developer", gisRoles), true);
  assert.equal(canAccessAnyRole("superadmin", gisRoles), true);
  assert.equal(canAccessAnyRole("admin", gisRoles), false);
  assert.equal(canAccessAnyRole("superadmin", ["admin"]), true);
  assert.equal(canAccessAnyRole("developer", ["admin"]), false);
});

test("IoT management roles exclude provincial admins", () => {
  const iotRoles = ["developer", "superadmin"];
  assert.equal(canAccessAnyRole("developer", iotRoles), true);
  assert.equal(canAccessAnyRole("superadmin", iotRoles), true);
  assert.equal(canAccessAnyRole("admin", iotRoles), false);
});

test("passengers can register without driver credentials", () => {
  assert.equal(RegisterBody.safeParse({ ...baseRegistration, role: "passenger" }).success, true);
});

test("registration requires explicit acceptance of terms", () => {
  assert.equal(
    RegisterBody.safeParse({ ...baseRegistration, acceptedTerms: false, role: "passenger" }).success,
    false,
  );
});

test("driver applications require vehicle, plate, and licence details", () => {
  assert.equal(
    RegisterBody.safeParse({ ...baseRegistration, role: "driver_applicant" }).success,
    false,
  );
  assert.equal(
    RegisterBody.safeParse({
      ...baseRegistration,
      role: "driver_applicant",
      vehicleType: "e-trike",
      plateNumber: "ABC 1234",
      licenseNumber: "N01-23-456789",
    }).success,
    true,
  );
});

test("trip ratings have a database-enforced trip/rater uniqueness constraint", () => {
  const index = getTableConfig(tripRatingsTable).indexes.find(
    (candidate) => candidate.config.name === "trip_ratings_trip_rater_unique_idx",
  );
  assert.ok(index);
  assert.equal(index.config.unique, true);
  assert.deepEqual(
    index.config.columns.map((column) => ("name" in column ? column.name : "expression")),
    ["trip_id", "rater_id"],
  );
});

test("trip ratings and active passenger bookings have database safety constraints", () => {
  const ratingChecks = getTableConfig(tripRatingsTable).checks.map((item) => item.name);
  assert.ok(ratingChecks.includes("trip_ratings_rating_range_check"));
  assert.ok(ratingChecks.includes("trip_ratings_different_users_check"));

  const passengerIndex = getTableConfig(tripsTable).indexes.find(
    (candidate) => candidate.config.name === "trips_active_passenger_unique_idx",
  );
  assert.ok(passengerIndex);
  assert.equal(passengerIndex.config.unique, true);
});

test("dispatch and administration invariants are enforced by the database schema", () => {
  const driverColumns = getTableConfig(driverProfilesTable).columns;
  const shiftColumn = driverColumns.find((column) => column.name === "is_on_shift");
  assert.ok(shiftColumn);
  assert.equal(shiftColumn.notNull, true);

  const activeSubscription = getTableConfig(subscriptionsTable).indexes.find(
    (candidate) => candidate.config.name === "subscriptions_one_active_per_user_idx",
  );
  assert.ok(activeSubscription);
  assert.equal(activeSubscription.config.unique, true);

  const orderedStops = getTableConfig(loopStopsTable).indexes.find(
    (candidate) => candidate.config.name === "loop_stops_route_sequence_idx",
  );
  assert.ok(orderedStops);
  assert.equal(orderedStops.config.unique, true);

  const gisChecks = getTableConfig(gisRouteCandidatesTable).checks.map((item) => item.name);
  assert.ok(gisChecks.includes("gis_route_candidates_status_check"));
  assert.ok(gisChecks.includes("gis_route_candidates_confidence_check"));
});

test("IoT devices, assignments, and telemetry have database concurrency guards", () => {
  const activeDevice = getTableConfig(gpsDevicesTable).indexes.find(
    (candidate) => candidate.config.name === "gps_devices_active_vehicle_idx",
  );
  const activeVehicleAssignment = getTableConfig(vehicleDriverAssignmentsTable).indexes.find(
    (candidate) => candidate.config.name === "vehicle_driver_assignments_active_vehicle_idx",
  );
  const activeDriverAssignment = getTableConfig(vehicleDriverAssignmentsTable).indexes.find(
    (candidate) => candidate.config.name === "vehicle_driver_assignments_active_driver_idx",
  );
  const uniqueDeviceEvent = getTableConfig(vehicleLocationPointsTable).indexes.find(
    (candidate) => candidate.config.name === "vehicle_location_points_device_event_idx",
  );

  for (const index of [
    activeDevice,
    activeVehicleAssignment,
    activeDriverAssignment,
    uniqueDeviceEvent,
  ]) {
    assert.ok(index);
    assert.equal(index.config.unique, true);
  }
});
