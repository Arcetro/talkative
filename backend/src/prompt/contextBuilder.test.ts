import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicContext } from "./contextBuilder.js";

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
