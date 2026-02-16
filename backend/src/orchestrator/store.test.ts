import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataRoot = await mkdtemp(path.join(tmpdir(), "talkative-orchestrator-test-"));
process.env.TALKATIVE_DATA_ROOT = dataRoot;
const orchestratorStore = await import("./store.js");

test.after(async () => {
  delete process.env.TALKATIVE_DATA_ROOT;
  await rm(dataRoot, { recursive: true, force: true });
});

test("orchestrator store creates and evolves run lifecycle", async () => {
  const runId = `test-run-${Date.now()}`;

  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default",
    agent_id: "agent-test",
    run_id: runId,
    type: "start_task",
    payload: { source: "test" }
  });

  let run = await orchestratorStore.getRun(runId);
  assert.ok(run);
  assert.equal(run?.status, "running");
  assert.equal(run?.subagent_state, "running");

  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default",
    agent_id: "agent-test",
    run_id: runId,
    type: "pause",
    payload: { source: "test" }
  });

  run = await orchestratorStore.getRun(runId);
  assert.equal(run?.status, "paused");
  assert.equal(run?.subagent_state, "paused");

  await orchestratorStore.appendEvent({
    tenant_id: "tenant-default",
    agent_id: "agent-test",
    run_id: runId,
    type: "error_compacted",
    message: "simulated error",
    payload: { source: "test" }
  });

  run = await orchestratorStore.getRun(runId);
  assert.equal(run?.status, "failed");
  assert.equal(run?.subagent_state, "error");
  assert.equal(run?.last_error, "simulated error");
  assert.ok((run?.steps.length ?? 0) >= 3);
});
