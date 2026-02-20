import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicContext, compactErrors, ContextEvent } from "./contextBuilder.js";

// ── Existing tests (backward compatibility) ─────────────────────────

test("context builder is deterministic for same input", () => {
  const input = {
    promptTemplate: "You are helpful",
    userMessage: "process this",
    skills: ["mail-triage", "git-watcher"],
    recentEvents: [
      { type: "MESSAGE_RECEIVED", message: "hello" },
      { type: "INTERPRETATION_RESULT", message: "2 tasks" }
    ],
    maxTokens: 400
  };

  const a = buildDeterministicContext(input);
  const b = buildDeterministicContext(input);

  assert.equal(a.context_text, b.context_text);
  assert.equal(a.token_estimate, b.token_estimate);
  assert.equal(a.truncated, false);
});

test("context builder truncates over token budget", () => {
  const long = "x".repeat(5000);
  const result = buildDeterministicContext({
    promptTemplate: "T",
    userMessage: long,
    skills: [],
    recentEvents: [],
    maxTokens: 50
  });

  assert.equal(result.truncated, true);
  assert.ok(result.context_text.includes("[TRUNCATED]"));
  assert.ok(result.token_estimate <= 55);
});

// ── compactErrors tests ─────────────────────────────────────────────

test("compactErrors returns empty string when no failures", () => {
  const events: ContextEvent[] = [
    { type: "TOOL_RUN_FINISHED", message: "ok", payload: { ok: true } },
    { type: "MESSAGE_RECEIVED", message: "hello" }
  ];
  assert.equal(compactErrors(events), "");
});

test("compactErrors returns empty string for empty array", () => {
  assert.equal(compactErrors([]), "");
});

test("compactErrors summarizes a single failure", () => {
  const events: ContextEvent[] = [
    {
      type: "TOOL_RUN_FINISHED",
      message: "Tool failed: node skills/mail-triage/scripts/triageEmails.ts",
      payload: {
        ok: false,
        command: "node skills/mail-triage/scripts/triageEmails.ts --input x --output y",
        error: { code: "TOOL_EXIT_NON_ZERO", message: "Cannot read input file" },
        metrics: { duration_ms: 120, exit_code: 1 }
      }
    }
  ];

  const result = compactErrors(events);
  assert.ok(result.includes("[RECENT ERRORS]"));
  assert.ok(result.includes("[/RECENT ERRORS]"));
  assert.ok(result.includes("1 tool failure(s) detected"));
  assert.ok(result.includes("TOOL_EXIT_NON_ZERO"));
  assert.ok(result.includes("Cannot read input file"));
  assert.ok(result.includes("exit: 1"));
});

test("compactErrors summarizes multiple failures", () => {
  const events: ContextEvent[] = [
    {
      type: "TOOL_RUN_FINISHED",
      message: "ok run",
      payload: { ok: true }
    },
    {
      type: "TOOL_RUN_FINISHED",
      message: "Tool failed: cmd1",
      payload: {
        ok: false,
        command: "node script1.ts",
        error: { code: "ERR_A", message: "reason A" },
        metrics: { exit_code: 1 }
      }
    },
    {
      type: "TOOL_RUN_FINISHED",
      message: "Tool failed: cmd2",
      payload: {
        ok: false,
        command: "node script2.ts",
        error: { code: "ERR_B", message: "reason B" },
        metrics: { exit_code: 2 }
      }
    }
  ];

  const result = compactErrors(events);
  assert.ok(result.includes("2 tool failure(s) detected"));
  assert.ok(result.includes("ERR_A"));
  assert.ok(result.includes("ERR_B"));
});

test("compactErrors handles missing payload fields gracefully", () => {
  const events: ContextEvent[] = [
    {
      type: "TOOL_RUN_FINISHED",
      message: "Tool failed somehow",
      payload: { ok: false }
    }
  ];

  const result = compactErrors(events);
  assert.ok(result.includes("1 tool failure(s) detected"));
  assert.ok(result.includes("command: unknown"));
  assert.ok(result.includes("code: UNKNOWN"));
  assert.ok(result.includes("exit: ?"));
});

test("context includes error block when failures present", () => {
  const events: ContextEvent[] = [
    { type: "MESSAGE_RECEIVED", message: "triage inbox" },
    {
      type: "TOOL_RUN_FINISHED",
      message: "Tool failed",
      payload: {
        ok: false,
        command: "node triage.ts",
        error: { code: "PARSE_ERR", message: "bad json" },
        metrics: { exit_code: 1 }
      }
    }
  ];

  const result = buildDeterministicContext({
    promptTemplate: "You are helpful",
    userMessage: "try again",
    skills: ["mail-triage"],
    recentEvents: events,
    maxTokens: 800
  });

  assert.ok(result.context_text.includes("[RECENT ERRORS]"));
  assert.ok(result.context_text.includes("PARSE_ERR"));
  assert.ok(result.context_text.includes("bad json"));
});

test("context omits error block when no failures", () => {
  const events: ContextEvent[] = [
    { type: "TOOL_RUN_FINISHED", message: "ok", payload: { ok: true } }
  ];

  const result = buildDeterministicContext({
    promptTemplate: "You are helpful",
    userMessage: "status",
    skills: [],
    recentEvents: events,
    maxTokens: 800
  });

  assert.ok(!result.context_text.includes("[RECENT ERRORS]"));
});
