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

export function buildDeterministicContext(input: {
  promptTemplate: string;
  userMessage: string;
  skills: string[];
  recentEvents: Array<{ type: string; message: string }>;
  maxTokens: number;
}): BuiltContext {
  const eventsText = input.recentEvents.map((e) => `- ${e.type}: ${e.message}`).join("\n");
  const skillsText = input.skills.join(", ");

  const combined = [
    `Prompt: ${input.promptTemplate}`,
    `User Message: ${input.userMessage}`,
    `Skills: ${skillsText || "none"}`,
    `Recent Events:\n${eventsText || "- none"}`
  ].join("\n\n");

  const compacted = truncateText(combined, input.maxTokens);
  return {
    prompt_template: input.promptTemplate,
    context_text: compacted.text,
    token_estimate: estimateTokens(compacted.text),
    truncated: compacted.truncated
  };
}
