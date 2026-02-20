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

test("tool runner parses SkillReportEnvelope from output file", async () => {
  const workspace = await createWorkspace();

  // Script that writes a valid SkillReportEnvelope
  await fs.writeFile(
    path.join(workspace, "scripts", "envelope.js"),
    [
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      'const args = process.argv;',
      'const out = args[args.indexOf("--output") + 1];',
      'fs.mkdirSync(path.dirname(out), { recursive: true });',
      'const report = {',
      '  ok: true,',
      '  generatedAt: new Date().toISOString(),',
      '  skillName: "test-skill",',
      '  data: { items: [1, 2, 3] },',
      '  metrics: { itemCount: 3 }',
      '};',
      'fs.writeFileSync(out, JSON.stringify(report), "utf8");',
      'console.log("done");'
    ].join("\n"),
    "utf8"
  );

  const result = await runWorkspaceTool(workspace, "node scripts/envelope.js --output outputs/report.json");

  assert.equal(result.ok, true);
  assert.ok(result.skillReport);
  assert.equal(result.skillReport.skillName, "test-skill");
  assert.equal(result.skillReport.ok, true);
  assert.equal(result.skillReport.metrics?.itemCount, 3);
});

test("tool runner detects skill-reported failure even with exit code 0", async () => {
  const workspace = await createWorkspace();

  // Script exits 0 but writes ok:false in envelope
  await fs.writeFile(
    path.join(workspace, "scripts", "soft-fail.js"),
    [
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      'const args = process.argv;',
      'const out = args[args.indexOf("--output") + 1];',
      'fs.mkdirSync(path.dirname(out), { recursive: true });',
      'const report = {',
      '  ok: false,',
      '  generatedAt: new Date().toISOString(),',
      '  skillName: "failing-skill",',
      '  data: null,',
      '  error: { code: "PARSE_ERROR", message: "Invalid input format" }',
      '};',
      'fs.writeFileSync(out, JSON.stringify(report), "utf8");',
      'console.log("wrote failure report");'
    ].join("\n"),
    "utf8"
  );

  const result = await runWorkspaceTool(workspace, "node scripts/soft-fail.js --output outputs/fail.json");

  // Process exited 0, but skill said ok:false → ToolRunner trusts the skill
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 0);
  assert.ok(result.skillReport);
  assert.equal(result.skillReport.ok, false);
  assert.equal(result.error?.code, "PARSE_ERROR");
  assert.equal(result.error?.message, "Invalid input format");
});

test("tool runner ignores non-envelope output gracefully", async () => {
  const workspace = await createWorkspace();

  // Original ok.js writes { ok: true } — not an envelope
  const result = await runWorkspaceTool(workspace, "node scripts/ok.js --output outputs/plain.json");

  assert.equal(result.ok, true);
  assert.equal(result.skillReport, undefined);
});
