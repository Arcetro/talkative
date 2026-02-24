import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataRoot = await mkdtemp(path.join(tmpdir(), "talkative-webhook-test-"));
process.env.TALKATIVE_DATA_ROOT = dataRoot;

const webhookStore = await import("./store.js");
const { handleWebhook } = await import("./handler.js");

test.after(async () => {
  delete process.env.TALKATIVE_DATA_ROOT;
  await rm(dataRoot, { recursive: true, force: true });
});

test("create webhook and list it", async () => {
  const wh = await webhookStore.createWebhook({
    tenant_id: "tenant-default",
    agent_id: "agent-test",
    label: "Booking system"
  });

  assert.ok(wh.id);
  assert.ok(wh.secret.length >= 20);
  assert.equal(wh.enabled, true);
  assert.deepEqual(wh.allowed_events, []);

  const list = await webhookStore.listWebhooks({ tenant_id: "tenant-default" });
  assert.ok(list.some((w) => w.id === wh.id));
});

test("handleWebhook accepts valid invocation", async () => {
  const wh = await webhookStore.createWebhook({
    tenant_id: "tenant-default",
    agent_id: "agent-wh",
    label: "Test webhook"
  });

  const result = await handleWebhook(wh.id, wh.secret, {
    event_type: "booking.confirmed",
    payload: { booking_id: "123" }
  });

  assert.equal(result.status, "accepted");
  assert.ok(result.run_id?.startsWith("wh-"));
  assert.ok(result.invocation_id);
});

test("handleWebhook rejects invalid secret", async () => {
  const wh = await webhookStore.createWebhook({
    tenant_id: "tenant-default",
    agent_id: "agent-wh2",
    label: "Secret test"
  });

  const result = await handleWebhook(wh.id, "wrong-secret", {
    event_type: "test.event"
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "invalid_secret");
});

test("handleWebhook rejects disabled webhook", async () => {
  const wh = await webhookStore.createWebhook({
    tenant_id: "tenant-default",
    agent_id: "agent-wh3",
    label: "Disable test"
  });

  await webhookStore.disableWebhook(wh.id);

  const result = await handleWebhook(wh.id, wh.secret, {
    event_type: "test.event"
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "webhook_disabled");
});

test("handleWebhook rejects unknown webhook", async () => {
  const result = await handleWebhook("nonexistent", "any-secret", {
    event_type: "test.event"
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "webhook_not_found");
});

test("handleWebhook rejects disallowed event type", async () => {
  const wh = await webhookStore.createWebhook({
    tenant_id: "tenant-default",
    agent_id: "agent-wh4",
    label: "Filtered webhook",
    allowed_events: ["booking.confirmed", "booking.cancelled"]
  });

  const result = await handleWebhook(wh.id, wh.secret, {
    event_type: "payment.received"
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "event_type_not_allowed");
});

test("invocations are logged", async () => {
  const wh = await webhookStore.createWebhook({
    tenant_id: "tenant-default",
    agent_id: "agent-wh5",
    label: "Log test"
  });

  await handleWebhook(wh.id, wh.secret, { event_type: "a" });
  await handleWebhook(wh.id, "bad", { event_type: "b" });

  const invocations = await webhookStore.listInvocations({ webhook_id: wh.id });
  assert.equal(invocations.length, 2);
  assert.equal(invocations[0].status, "accepted");
  assert.equal(invocations[1].status, "rejected");
});
