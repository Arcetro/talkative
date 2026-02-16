import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { runWorkspaceTool } from "./toolRunner.js";

async function createWorkspace(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "talkative-tool-test-"));
  await fs.mkdir(path.join(base, "scripts"), { recursive: true });
  await fs.mkdir(path.join(base, "inputs"), { recursive: true });
  await fs.mkdir(path.join(base, "outputs"), { recursive: true });

  await fs.writeFile(path.join(base, "inputs", "seed.txt"), "seed", "utf8");
  await fs.writeFile(
    path.join(base, "scripts", "ok.js"),
    [
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      'const args = process.argv;',
      'const out = args[args.indexOf("--output") + 1];',
      'fs.mkdirSync(path.dirname(out), { recursive: true });',
      'fs.writeFileSync(out, JSON.stringify({ ok: true }), "utf8");',
      'console.log("done");'
    ].join("\n"),
    "utf8"
  );

  return base;
}

test("tool runner returns normalized success contract", async () => {
  const workspace = await createWorkspace();
  const command = "node scripts/ok.js --input inputs/seed.txt --output outputs/out.json";

  const result = await runWorkspaceTool(workspace, command);

  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
  assert.equal(typeof result.metrics.duration_ms, "number");
  assert.ok(result.artifacts.some((a) => a.type === "file" && a.path.endsWith("outputs/out.json")));
  const out = await fs.readFile(path.join(workspace, "outputs", "out.json"), "utf8");
  assert.ok(out.includes('"ok":true'));
});

test("tool runner blocks path escape outside workspace", async () => {
  const workspace = await createWorkspace();
  const command = "node scripts/ok.js --output ../outside.json";

  await assert.rejects(async () => runWorkspaceTool(workspace, command));
});
