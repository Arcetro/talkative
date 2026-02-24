import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataRoot = await mkdtemp(path.join(tmpdir(), "talkative-orchestrator-test-"));
process.env.TALKATIVE_DATA_ROOT = dataRoot;
const orchestratorStore = await import("./store.js");
const { getActiveRunForAgent } = orchestratorStore;

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

test("getActiveRunForAgent returns most recent active run", async () => {
  const agentId = `agent-active-${Date.now()}`;
  const runId = `test-active-${Date.now()}`;

  // No active run yet
  let active = await getActiveRunForAgent(agentId);
  assert.equal(active, null);

  // Start a run
  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default", agent_id: agentId, run_id: runId,
    type: "start_task", payload: { source: "test" }
  });
  active = await getActiveRunForAgent(agentId);
  assert.ok(active);
  assert.equal(active?.status, "running");
  assert.equal(active?.run_id, runId);

  // Pause it
  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default", agent_id: agentId, run_id: runId,
    type: "pause", payload: { source: "test" }
  });
  active = await getActiveRunForAgent(agentId);
  assert.ok(active);
  assert.equal(active?.status, "paused");

  // Cancel it — no longer active
  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default", agent_id: agentId, run_id: runId,
    type: "cancel", payload: { source: "test" }
  });
  active = await getActiveRunForAgent(agentId);
  assert.equal(active, null);
});

test("paused run blocks resume to running correctly", async () => {
  const agentId = `agent-resume-${Date.now()}`;
  const runId = `test-resume-${Date.now()}`;

  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default", agent_id: agentId, run_id: runId,
    type: "start_task", payload: { source: "test" }
  });
  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default", agent_id: agentId, run_id: runId,
    type: "pause", payload: { source: "test" }
  });

  let active = await getActiveRunForAgent(agentId);
  assert.equal(active?.status, "paused");

  // Resume
  await orchestratorStore.appendCommand({
    tenant_id: "tenant-default", agent_id: agentId, run_id: runId,
    type: "resume", payload: { source: "test" }
  });
  active = await getActiveRunForAgent(agentId);
  assert.equal(active?.status, "running");
});
