import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataRoot = await mkdtemp(path.join(tmpdir(), "talkative-prompt-test-"));
process.env.TALKATIVE_DATA_ROOT = dataRoot;
const promptStore = await import("./store.js");

test.after(async () => {
  delete process.env.TALKATIVE_DATA_ROOT;
  await rm(dataRoot, { recursive: true, force: true });
});

test("prompt store versions and activates per tenant/agent", async () => {
  const tenant_id = "tenant-prompt";
  const agent_id = "agent-prompt";

  const v1 = await promptStore.createPromptVersion({
    tenant_id,
    agent_id,
    template: "template-v1",
    activate: true
  });
  assert.equal(v1.version, 1);
  assert.equal(v1.is_active, true);

  const v2 = await promptStore.createPromptVersion({
    tenant_id,
    agent_id,
    template: "template-v2",
    activate: false
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.is_active, false);

  const activated = await promptStore.activatePromptVersion({
    tenant_id,
    agent_id,
    version: 2
  });
  assert.equal(activated.version, 2);
  assert.equal(activated.is_active, true);

  const all = await promptStore.listPrompts({ tenant_id, agent_id });
  assert.equal(all.length, 2);
  assert.equal(all.filter((p) => p.is_active).length, 1);
  assert.equal(all.find((p) => p.is_active)?.version, 2);
});
