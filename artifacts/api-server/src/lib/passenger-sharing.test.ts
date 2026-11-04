import assert from "node:assert/strict";
import test from "node:test";
import {
  canSharePickupLocation,
  PassengerPoint,
  recentPassengerPoint,
} from "./passenger-sharing";
import { validProfilePhoto } from "./profile-photo";

const now = Date.parse("2026-11-04T01:00:00Z");
const run = {
  status: "boarding",
  currentStopIndex: 0,
  departureAt: new Date(now + 20 * 60_000),
  arrivalAt: new Date(now + 50 * 60_000),
};
const reservation = { status: "confirmed", source: "app", pickupIndex: 1 };
test("pickup sharing is limited to an upcoming confirmed app reservation", () => {
  assert.equal(canSharePickupLocation(reservation, run, now), true);
  for (const status of ["boarded", "completed", "cancelled", "no_show"])
    assert.equal(
      canSharePickupLocation({ ...reservation, status }, run, now),
      false,
      status,
    );
  for (const status of ["completed", "cancelled"])
    assert.equal(
      canSharePickupLocation(reservation, { ...run, status }, now),
      false,
      status,
    );
  assert.equal(
    canSharePickupLocation({ ...reservation, source: "walk_in" }, run, now),
    false,
  );
  assert.equal(
    canSharePickupLocation(reservation, { ...run, currentStopIndex: 2 }, now),
    false,
  );
  assert.equal(
    canSharePickupLocation(
      reservation,
      run,
      run.departureAt.getTime() - 60 * 60_000 - 1,
    ),
    false,
  );
  assert.equal(
    canSharePickupLocation(
      reservation,
      run,
      run.arrivalAt.getTime() + 60 * 60_000 + 1,
    ),
    false,
  );
});
test("invalid, stale and future GPS positions are not exposed as live", () => {
  const point = {
    lat: 18.3,
    lon: 121.3,
    accuracyM: 10,
    capturedAt: new Date(now).toISOString(),
  };
  assert.equal(PassengerPoint.safeParse(point).success, true);
  assert.equal(PassengerPoint.safeParse({ ...point, lat: 91 }).success, false);
  assert.equal(
    PassengerPoint.safeParse({ ...point, lon: -181 }).success,
    false,
  );
  assert.equal(recentPassengerPoint(point.capturedAt, now), true);
  assert.equal(
    recentPassengerPoint(new Date(now - 45_001).toISOString(), now),
    false,
  );
  assert.equal(
    recentPassengerPoint(new Date(now + 5_001).toISOString(), now),
    false,
  );
  assert.equal(recentPassengerPoint("invalid", now), false);
});
test("avatar updates cannot store remote URLs, SVG, invalid or oversized images", () => {
  assert.equal(validProfilePhoto(""), true);
  for (const value of [
    "https://example.com/photo.jpg",
    "file:///etc/passwd",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/jpeg;base64,AAAA",
    `data:image/jpeg;base64,${"A".repeat(180_000)}`,
  ])
    assert.equal(validProfilePhoto(value), false);
});
