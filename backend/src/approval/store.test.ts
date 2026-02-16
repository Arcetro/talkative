import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataRoot = await mkdtemp(path.join(tmpdir(), "talkative-approval-test-"));
process.env.TALKATIVE_DATA_ROOT = dataRoot;
const approvalStore = await import("./store.js");

test.after(async () => {
  delete process.env.TALKATIVE_DATA_ROOT;
  await rm(dataRoot, { recursive: true, force: true });
});

test("approval store creates, decides and filters requests", async () => {
  const tenant_id = "tenant-approval";
  const agent_id = "agent-approval";

  const pending = await approvalStore.createApproval({
    tenant_id,
    agent_id,
    run_id: "run-approval-1",
    reason: "sensitive tool command"
  });

  assert.equal(pending.status, "pending");
  assert.equal(pending.tenant_id, tenant_id);
  assert.equal(pending.agent_id, agent_id);

  const decided = await approvalStore.decideApproval({
    id: pending.id,
    operator_id: "ops-1",
    decision: "approved",
    note: "safe to run"
  });

  assert.equal(decided.status, "approved");
  assert.equal(decided.decided_by, "ops-1");

  const approved = await approvalStore.listApprovals({
    tenant_id,
    agent_id,
    status: "approved"
  });
  assert.equal(approved.length, 1);
  assert.equal(approved[0]?.id, pending.id);
});
