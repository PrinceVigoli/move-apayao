import assert from "node:assert/strict";
import test from "node:test";
import {
  getPilotServiceArea,
  haversineKm,
  validatePilotEndpoints,
  validatePilotTripDistance,
} from "./service-area";

const area = {
  enabled: true,
  label: "test pilot",
  centerLat: 18.283,
  centerLon: 121.372,
  radiusKm: 20,
  minimumTripKm: 0.2,
};

test("Pudtol and Luna pilot endpoints are inside the default radius", () => {
  assert.deepEqual(
    validatePilotEndpoints(
      { lat: 18.2340899, lon: 121.3670283 },
      { lat: 18.3321469, lon: 121.3779476 },
      area,
    ),
    { ok: true },
  );
});

test("endpoint validation identifies the invalid field", () => {
  const result = validatePilotEndpoints(
    { lat: 18.283, lon: 121.372 },
    { lat: 17.5, lon: 121.372 },
    area,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.field, "dropoff");
});

test("minimum point-to-point distance rejects accidental same-point bookings", () => {
  assert.equal(validatePilotTripDistance(0.05, area).ok, false);
  assert.equal(validatePilotTripDistance(0.5, area).ok, true);
});

test("service area can be disabled explicitly", () => {
  assert.equal(
    getPilotServiceArea({ PILOT_SERVICE_AREA_ENABLED: "false" }).enabled,
    false,
  );
});

test("haversine distance is zero for the same point", () => {
  assert.equal(haversineKm({ lat: 18.2, lon: 121.3 }, { lat: 18.2, lon: 121.3 }), 0);
});
