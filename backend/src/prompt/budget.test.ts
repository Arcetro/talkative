import test from "node:test";
import assert from "node:assert/strict";
import { allocateAndTruncate } from "./budget.js";
import { buildBudgetedContext } from "./contextBuilder.js";

// ── allocateAndTruncate tests ───────────────────────────────────────

test("all sections fit within budget — no truncation", () => {
  const sections = [
    { name: "prompt" as const, content: "Short prompt" },
    { name: "user_message" as const, content: "Hello" },
    { name: "events" as const, content: "- event1" },
    { name: "errors" as const, content: "" },
  ];

  const { results, report } = allocateAndTruncate(sections, 500);

  assert.equal(report.total_budget, 500);
  assert.ok(report.total_used < 500);
  assert.ok(report.sections.every((s) => !s.truncated));
  assert.equal(results.length, 4);
});

test("large section gets truncated to its budget", () => {
  const bigContent = "x".repeat(4000); // ~1000 tokens
  const sections = [
    { name: "prompt" as const, content: bigContent },
    { name: "user_message" as const, content: "Hi" },
    { name: "events" as const, content: "- e" },
    { name: "errors" as const, content: "" },
  ];

  const { report } = allocateAndTruncate(sections, 200);

  const promptSection = report.sections.find((s) => s.name === "prompt")!;
  assert.equal(promptSection.truncated, true);
  assert.ok(promptSection.used <= promptSection.allocated + 5); // +5 for [TRUNCATED] tag
});

test("surplus from small sections redistributes to large ones", () => {
  const bigEvents = "x".repeat(2000); // ~500 tokens, needs more than 30%
  const sections = [
    { name: "prompt" as const, content: "Short" },           // uses ~2 tokens
    { name: "user_message" as const, content: "Also short" }, // uses ~3 tokens
    { name: "events" as const, content: bigEvents },          // needs ~500 tokens
    { name: "errors" as const, content: "" },                 // uses 0
  ];

  const { report } = allocateAndTruncate(sections, 400);

  const eventsSection = report.sections.find((s) => s.name === "events")!;
  // Events got 30% of 400 = 120 initially, but should receive surplus from others
  assert.ok(eventsSection.allocated > 120, `expected > 120, got ${eventsSection.allocated}`);
});

test("budget report totals are consistent", () => {
  const sections = [
    { name: "prompt" as const, content: "Some prompt text here" },
    { name: "user_message" as const, content: "User says something" },
    { name: "events" as const, content: "- EVENT_A: did thing\n- EVENT_B: did other" },
    { name: "errors" as const, content: "[RECENT ERRORS]\n1 failure\n[/RECENT ERRORS]" },
  ];

  const { report } = allocateAndTruncate(sections, 300);

  const sumUsed = report.sections.reduce((s, sec) => s + sec.used, 0);
  assert.equal(report.total_used, sumUsed);
  assert.ok(report.total_used <= report.total_budget);
});

test("custom weights override defaults", () => {
  const sections = [
    { name: "prompt" as const, content: "x".repeat(800) },
    { name: "user_message" as const, content: "y".repeat(800) },
    { name: "events" as const, content: "z".repeat(100) },
    { name: "errors" as const, content: "" },
  ];

  const customWeights = { prompt: 0.50, user_message: 0.10, events: 0.30, errors: 0.10 };
  const { report } = allocateAndTruncate(sections, 200, customWeights);

  const promptSection = report.sections.find((s) => s.name === "prompt")!;
  const msgSection = report.sections.find((s) => s.name === "user_message")!;
  // Prompt got 50% = 100, message got 10% = 20 (before redistribution)
  assert.ok(promptSection.allocated >= msgSection.allocated);
});

// ── buildBudgetedContext tests ───────────────────────────────────────

test("buildBudgetedContext returns budget report", () => {
  const result = buildBudgetedContext({
    promptTemplate: "You are a helpful agent",
    userMessage: "Process my inbox",
    skills: ["mail-triage"],
    recentEvents: [
      { type: "MESSAGE_RECEIVED", message: "hello" },
    ],
    maxTokens: 500,
  });

  assert.ok(result.budget);
  assert.equal(result.budget.total_budget, 500);
  assert.equal(result.budget.sections.length, 4);
  assert.ok(result.context_text.includes("You are a helpful agent"));
  assert.ok(result.context_text.includes("Process my inbox"));
});

test("buildBudgetedContext truncates large user message", () => {
  const longMessage = "word ".repeat(2000); // ~2500 tokens

  const result = buildBudgetedContext({
    promptTemplate: "Be concise",
    userMessage: longMessage,
    skills: [],
    recentEvents: [],
    maxTokens: 200,
  });

  assert.equal(result.truncated, true);
  const msgSection = result.budget!.sections.find((s) => s.name === "user_message")!;
  assert.equal(msgSection.truncated, true);
});

test("buildBudgetedContext with errors includes error section", () => {
  const result = buildBudgetedContext({
    promptTemplate: "Handle errors",
    userMessage: "retry",
    skills: [],
    recentEvents: [
      {
        type: "TOOL_RUN_FINISHED",
        message: "fail",
        payload: {
          ok: false,
          command: "node x.ts",
          error: { code: "ERR", message: "boom" },
          metrics: { exit_code: 1 },
        },
      },
    ],
    maxTokens: 500,
  });

  assert.ok(result.context_text.includes("[RECENT ERRORS]"));
  const errSection = result.budget!.sections.find((s) => s.name === "errors")!;
  assert.ok(errSection.used > 0);
});

test("buildBudgetedContext respects custom weights", () => {
  const result = buildBudgetedContext({
    promptTemplate: "x".repeat(400),
    userMessage: "short",
    skills: [],
    recentEvents: [],
    maxTokens: 200,
    weights: { prompt: 0.60, user_message: 0.20, events: 0.15, errors: 0.05 },
  });

  const promptSection = result.budget!.sections.find((s) => s.name === "prompt")!;
  // 60% of 200 = 120 tokens initial allocation for prompt
  assert.ok(promptSection.allocated >= 100);
});
