import assert from "node:assert/strict";
import test from "node:test";
import { INTERNAL_RUNBOOKS_UPDATED_AT, INTERNAL_RUNBOOKS_VERSION, internalRunbooks } from "./internal-runbooks";

test("internal runbooks have stable public metadata and complete escalation guidance", () => {
  assert.match(INTERNAL_RUNBOOKS_VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(INTERNAL_RUNBOOKS_UPDATED_AT, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(internalRunbooks.length >= 5);
  assert.equal(new Set(internalRunbooks.map((runbook) => runbook.id)).size, internalRunbooks.length);
  for (const runbook of internalRunbooks) {
    assert.ok(runbook.title.length > 5);
    assert.ok(runbook.steps.length >= 5);
    assert.ok(runbook.escalation.length > 20);
  }
});
