import assert from "node:assert/strict";
import test from "node:test";
import { computeStraightLineRoute } from "./google-routes";

test("ordered loop stops are not auto-closed into a triangle", () => {
  const route = computeStraightLineRoute([
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
    { lat: 1, lon: 1 },
  ]);

  // Two one-degree legs are roughly 222.4 km. Adding a final implicit leg
  // back to the first stop would be roughly 379.6 km and recreate the bug.
  assert.ok(route.distanceKm > 222 && route.distanceKm < 223);
  assert.equal(route.encodedPolyline, null);
  assert.equal(route.source, "haversine_fallback");
});

