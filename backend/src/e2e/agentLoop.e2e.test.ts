import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataRoot = await mkdtemp(path.join(tmpdir(), "talkative-e2e-"));
process.env.TALKATIVE_DATA_ROOT = dataRoot;

const { AgentHub } = await import("../agents/agentHub.js");
const { listApprovals } = await import("../approval/store.js");
const { listRuns } = await import("../orchestrator/store.js");
const { getUsage } = await import("../router/store.js");

const createdWorkspaces: string[] = [];

test.after(async () => {
  delete process.env.TALKATIVE_DATA_ROOT;

  for (const workspace of createdWorkspaces) {
    await rm(workspace, { recursive: true, force: true });
  }

  await rm(dataRoot, { recursive: true, force: true });
});

test("critical loop: message -> interpretation -> patch -> approval -> heartbeat -> telemetry", async () => {
  const tenantId = "tenant-e2e";
  const agentId = `agent-e2e-${Date.now()}`;
  const workspace = `e2e-${Date.now()}`;
  const hub = new AgentHub();

  await hub.init();

  const created = await hub.createAgent({
    id: agentId,
    tenant_id: tenantId,
    name: "E2E Loop Agent",
    workspace
  });
  createdWorkspaces.push(created.workspace);

  await hub.startAgent(agentId);

  const response = await hub.sendMessage(
    agentId,
    "triage my inbox and then transfer funds heartbeat run now"
  );

  assert.equal(response.agentId, agentId);
  assert.ok(response.interpretation);
  assert.ok(response.interpretation!.detectedTasks.length >= 2);
  assert.ok(response.workflowPatch);
  assert.ok(response.workflowPatch!.operations.length >= 2);

  const actionTypes = new Set(response.actions.map((a) => a.type));
  assert.ok(actionTypes.has("human_approval_required"));
  assert.ok(actionTypes.has("heartbeat.executed"));

  const events = await hub.getEvents(agentId, 200);
  const eventTypes = new Set(events.map((event) => event.type));
  assert.ok(eventTypes.has("AGENT_CREATED"));
  assert.ok(eventTypes.has("AGENT_STARTED"));
  assert.ok(eventTypes.has("MESSAGE_RECEIVED"));
  assert.ok(eventTypes.has("INTERPRETATION_RESULT"));
  assert.ok(eventTypes.has("WORKFLOW_PATCH_PROPOSED"));
  assert.ok(eventTypes.has("WORKFLOW_PATCH_APPLIED"));
  assert.ok(eventTypes.has("HEARTBEAT_TICK"));
  assert.ok(eventTypes.has("TOOL_RUN_STARTED"));
  assert.ok(eventTypes.has("TOOL_RUN_FINISHED"));
  assert.ok(eventTypes.has("METRIC_RECORDED"));

  const pendingApprovals = await listApprovals({
    tenant_id: tenantId,
    agent_id: agentId,
    status: "pending"
  });
  assert.ok(pendingApprovals.length >= 1);
  assert.match(pendingApprovals[0]!.reason.toLowerCase(), /transfer/);

  const runs = await listRuns({
    tenant_id: tenantId,
    agent_id: agentId,
    limit: 20
  });
  assert.ok(runs.length >= 1);
  assert.ok((runs[0]?.steps.length ?? 0) >= 1);

  const usage = await getUsage({
    tenant_id: tenantId,
    agent_id: agentId,
    limit: 10
  });
  assert.ok(usage.length >= 1);
  assert.equal(usage.at(-1)?.status, "ok");

  await hub.stopAgent(agentId);
});

test("sending a message to a stopped agent fails", async () => {
  const hub = new AgentHub();
  await hub.init();

  const id = `agent-e2e-stopped-${Date.now()}`;
  const created = await hub.createAgent({
    id,
    tenant_id: "tenant-e2e",
    name: "Stopped Agent E2E",
    workspace: `e2e-stopped-${Date.now()}`
  });
  createdWorkspaces.push(created.workspace);

  await assert.rejects(
    () => hub.sendMessage(id, "hello while stopped"),
    /Agent is stopped/
  );
});
