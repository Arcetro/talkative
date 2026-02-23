import assert from "node:assert/strict";
import test from "node:test";
import { buildLogEntry } from "./logger.js";

test("buildLogEntry includes level, message and context", () => {
  const row = buildLogEntry({
    level: "info",
    message: "http.request.completed",
    context: {
      request_id: "req-1",
      tenant_id: "tenant-a",
      agent_id: "agent-a",
      run_id: "run-a"
    },
    data: { status_code: 200 }
  });

  assert.equal(row.level, "info");
  assert.equal(row.message, "http.request.completed");
  assert.equal(row.context?.request_id, "req-1");
  assert.equal(row.data?.status_code, 200);
  assert.ok(typeof row.timestamp === "string");
});
