import { interpolate } from "./interpolate.js";
import { BuiltContext } from "./types.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateText(text: string, maxTokens: number): { text: string; truncated: boolean } {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n\n[TRUNCATED]`,
    truncated: true
  };
}

/**
 * Event shape enriched with optional error payload.
 *
 * When AgentRunner emits TOOL_RUN_FINISHED with ok=false it includes
 * `payload.error` and `payload.metrics`.  The caller can forward those
 * fields here so the context builder can produce a compact error summary
 * that helps the LLM reason about what went wrong.
 */
export interface ContextEvent {
  type: string;
  message: string;
  payload?: {
    ok?: boolean;
    error?: { code: string; message: string };
    metrics?: { duration_ms?: number; exit_code?: number | null };
    command?: string;
    [key: string]: unknown;
  };
}

/**
 * Extract recent failures from events and produce a compact summary block.
 *
 * The summary is designed to sit inside the LLM context window so the model
 * can decide whether to retry, skip, or escalate.  It is intentionally terse
 * to save tokens.
 *
 * Ref: 12-factor-agents Factor 9 — Compact Errors into Context.
 */
export function compactErrors(events: ContextEvent[]): string {
  const failures = events.filter(
    (e) => e.type === "TOOL_RUN_FINISHED" && e.payload?.ok === false
  );

  if (failures.length === 0) return "";

  const lines = failures.map((f) => {
    const cmd = typeof f.payload?.command === "string" ? f.payload.command : "unknown";
    const code = f.payload?.error?.code ?? "UNKNOWN";
    const msg = f.payload?.error?.message ?? f.message;
    const exit = f.payload?.metrics?.exit_code ?? "?";
    return `  - command: ${cmd} | code: ${code} | exit: ${exit} | reason: ${msg}`;
  });

  return [
    "[RECENT ERRORS]",
    `${failures.length} tool failure(s) detected:`,
    ...lines,
    "Consider: retry with different input, skip the failing step, or request human help.",
    "[/RECENT ERRORS]"
  ].join("\n");
}

export function buildDeterministicContext(input: {
  promptTemplate: string;
  userMessage: string;
  skills: string[];
  recentEvents: ContextEvent[];
  maxTokens: number;
  variables?: Record<string, string>;
}): BuiltContext {
  const eventsText = input.recentEvents.map((e) => `- ${e.type}: ${e.message}`).join("\n");
  const skillsText = input.skills.join(", ");
  const errorBlock = compactErrors(input.recentEvents);

  // Interpolate template variables before building context
  const { text: resolvedPrompt } = interpolate(input.promptTemplate, input.variables ?? {});

  const sections = [
    `Prompt: ${resolvedPrompt}`,
    `User Message: ${input.userMessage}`,
    `Skills: ${skillsText || "none"}`,
    `Recent Events:\n${eventsText || "- none"}`
  ];

  if (errorBlock) {
    sections.push(errorBlock);
  }

  const combined = sections.join("\n\n");
  const compacted = truncateText(combined, input.maxTokens);
  return {
    prompt_template: resolvedPrompt,
    context_text: compacted.text,
    token_estimate: estimateTokens(compacted.text),
    truncated: compacted.truncated
  };
}
