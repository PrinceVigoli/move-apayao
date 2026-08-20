import assert from "node:assert/strict";
import test from "node:test";
import { hashToken } from "./tokens";
import { issueDeviceToken, readDeviceAuthorization, verifyDeviceToken } from "./device-auth";

test("device tokens are random and verify only against their own hash", () => {
  const first = issueDeviceToken();
  const second = issueDeviceToken();
  assert.notEqual(first, second);
  assert.equal(verifyDeviceToken(first, hashToken(first)), true);
  assert.equal(verifyDeviceToken(second, hashToken(first)), false);
});

test("device authorization parser requires the Device scheme", () => {
  assert.equal(readDeviceAuthorization("Device abc123"), "abc123");
  assert.equal(readDeviceAuthorization("Bearer abc123"), null);
  assert.equal(readDeviceAuthorization(undefined), null);
});
