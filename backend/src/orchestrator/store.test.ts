import test from "node:test";
import assert from "node:assert/strict";
import { appendCommand, appendEvent, getRun } from "./store.js";

test("orchestrator store creates and evolves run lifecycle", async () => {
  const runId = `test-run-${Date.now()}`;

  await appendCommand({
    tenant_id: "tenant-default",
    agent_id: "agent-test",
    run_id: runId,
    type: "start_task",
    payload: { source: "test" }
  });

  let run = await getRun(runId);
  assert.ok(run);
  assert.equal(run?.status, "running");
  assert.equal(run?.subagent_state, "running");

  await appendCommand({
    tenant_id: "tenant-default",
    agent_id: "agent-test",
    run_id: runId,
    type: "pause",
    payload: { source: "test" }
  });

  run = await getRun(runId);
  assert.equal(run?.status, "paused");
  assert.equal(run?.subagent_state, "paused");

  await appendEvent({
    tenant_id: "tenant-default",
    agent_id: "agent-test",
    run_id: runId,
    type: "error_compacted",
    message: "simulated error",
    payload: { source: "test" }
  });

  run = await getRun(runId);
  assert.equal(run?.status, "failed");
  assert.equal(run?.subagent_state, "error");
  assert.equal(run?.last_error, "simulated error");
  assert.ok((run?.steps.length ?? 0) >= 3);
});
