import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataRoot = await mkdtemp(path.join(tmpdir(), "talkative-event-test-"));
process.env.TALKATIVE_DATA_ROOT = dataRoot;
const eventStore = await import("./eventStore.js");

test.after(async () => {
  delete process.env.TALKATIVE_DATA_ROOT;
  await rm(dataRoot, { recursive: true, force: true });
});

const baseEvent = {
  agentId: "agent-test-1",
  agent_id: "agent-test-1",
  tenant_id: "tenant-test",
  type: "MESSAGE_RECEIVED" as const,
  message: "test"
};

test("append and read events", async () => {
  const e1 = await eventStore.appendAgentEvent({ ...baseEvent, message: "msg-1" });
  const e2 = await eventStore.appendAgentEvent({ ...baseEvent, message: "msg-2" });

  assert.ok(e1.id);
  assert.ok(e2.id);
  assert.ok(e1.timestamp);

  const events = await eventStore.readAgentEvents("agent-test-1", 10);
  assert.ok(events.length >= 2);
  assert.ok(events.some((e) => e.message === "msg-1"));
  assert.ok(events.some((e) => e.message === "msg-2"));
});

test("readAgentEvents respects limit", async () => {
  // Append several more
  for (let i = 0; i < 5; i++) {
    await eventStore.appendAgentEvent({ ...baseEvent, message: `extra-${i}` });
  }

  const limited = await eventStore.readAgentEvents("agent-test-1", 3);
  assert.equal(limited.length, 3);
  // Should be the 3 most recent
  assert.ok(limited[2].message.startsWith("extra-"));
});

test("readAgentEvents returns empty for unknown agent", async () => {
  const events = await eventStore.readAgentEvents("nonexistent-agent", 10);
  assert.deepEqual(events, []);
});

test("countAgentEvents returns correct count", async () => {
  const count = await eventStore.countAgentEvents("agent-test-1");
  assert.ok(count >= 7); // 2 from first test + 5 from second
});

test("countAgentEvents returns 0 for unknown agent", async () => {
  const count = await eventStore.countAgentEvents("nonexistent-agent");
  assert.equal(count, 0);
});

test("pruneAgentEvents keeps most recent N events", async () => {
  // Use a fresh agent to have deterministic counts
  const agentId = "agent-prune-test";
  const pruneEvent = { ...baseEvent, agentId, agent_id: agentId };

  for (let i = 0; i < 10; i++) {
    await eventStore.appendAgentEvent({ ...pruneEvent, message: `prune-${i}` });
  }

  const countBefore = await eventStore.countAgentEvents(agentId);
  assert.equal(countBefore, 10);

  const removed = await eventStore.pruneAgentEvents(agentId, 3);
  assert.equal(removed, 7);

  const countAfter = await eventStore.countAgentEvents(agentId);
  assert.equal(countAfter, 3);

  // Verify it kept the MOST RECENT 3
  const remaining = await eventStore.readAgentEvents(agentId, 10);
  assert.equal(remaining.length, 3);
  assert.equal(remaining[0].message, "prune-7");
  assert.equal(remaining[1].message, "prune-8");
  assert.equal(remaining[2].message, "prune-9");
});

test("pruneAgentEvents is a no-op when under threshold", async () => {
  const agentId = "agent-prune-noop";
  const noopEvent = { ...baseEvent, agentId, agent_id: agentId };

  for (let i = 0; i < 3; i++) {
    await eventStore.appendAgentEvent({ ...noopEvent, message: `noop-${i}` });
  }

  const removed = await eventStore.pruneAgentEvents(agentId, 5);
  assert.equal(removed, 0);

  const count = await eventStore.countAgentEvents(agentId);
  assert.equal(count, 3);
});

test("autoPruneIfNeeded only prunes above threshold", async () => {
  const agentId = "agent-autoprune";
  const autoEvent = { ...baseEvent, agentId, agent_id: agentId };

  // Below threshold — should not prune
  for (let i = 0; i < 5; i++) {
    await eventStore.appendAgentEvent({ ...autoEvent, message: `auto-${i}` });
  }
  const removedUnder = await eventStore.autoPruneIfNeeded(agentId);
  assert.equal(removedUnder, 0);
  assert.equal(await eventStore.countAgentEvents(agentId), 5);
});
