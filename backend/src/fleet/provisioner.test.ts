import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { provisionAgentOnNode } from "./provisioner.js";
import { NodeHost } from "./types.js";

let baseDir = "";

test.before(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), "talkative-provisioner-test-"));
});

test.after(async () => {
  if (baseDir) {
    await rm(baseDir, { recursive: true, force: true });
  }
});

function buildLocalNode(): NodeHost {
  return {
    id: "node-local-test",
    tenant_id: "tenant-default",
    agent_id: "system-fleet",
    cloud_id: "local-cloud",
    name: "Local Test Node",
    mode: "local",
    base_path: baseDir,
    created_at: new Date().toISOString()
  };
}

test("provision local node is idempotent on repeated calls", async () => {
  const first = await provisionAgentOnNode({
    node: buildLocalNode(),
    agent_id: "agent-local-idempotent",
    tenant_id: "tenant-default",
    skills: ["mail-triage"]
  });
  assert.equal(first.reused, false);

  const second = await provisionAgentOnNode({
    node: buildLocalNode(),
    agent_id: "agent-local-idempotent",
    tenant_id: "tenant-default",
    skills: ["mail-triage"]
  });
  assert.equal(second.reused, true);
  assert.equal(second.status_path, first.status_path);
});

test("provision local node fails on unknown skill", async () => {
  await assert.rejects(
    () =>
      provisionAgentOnNode({
        node: buildLocalNode(),
        agent_id: "agent-local-missing-skill",
        tenant_id: "tenant-default",
        skills: ["skill-does-not-exist"]
      }),
    /Skill template not found/
  );
});

