import assert from "node:assert/strict";
import test from "node:test";
import { isTripContactVisible } from "./trip-contact";

test("trip contact is hidden before acceptance and after the ride", () => {
  for (const status of ["requested", "matched", "completed", "cancelled"]) {
    assert.equal(isTripContactVisible(status), false, status);
  }
});

test("trip contact is visible only during an accepted active ride", () => {
  for (const status of ["accepted", "arrived", "in_progress"]) {
    assert.equal(isTripContactVisible(status), true, status);
  }
});
