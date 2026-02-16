import { InterpreterResult } from "../domain/types.js";

const SEPARATORS = /\s*(?:->|→|>|,|;|\.|\bthen\b|\by luego\b|\bluego\b|\band\b|\by\b)\s*/gi;

function normalizeTask(raw: string): string {
  const cleaned = raw.replace(/^[-\d\s]+/, "").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function interpretConversation(inputText: string): InterpreterResult {
  const segments = inputText
    .split(SEPARATORS)
    .map(normalizeTask)
    .filter((task) => task.length > 1);

  const uniqueTasks = Array.from(new Set(segments));

  const nodeSuggestions = uniqueTasks.map((task) => ({
    type: "node" as const,
    name: task,
    description: `Task interpreted from conversation: ${task}`
  }));

  const links = uniqueTasks.slice(0, -1).map((task, index) => ({
    sourceName: task,
    targetName: uniqueTasks[index + 1]
  }));

  return {
    detectedTasks: uniqueTasks,
    suggestions: [
      ...nodeSuggestions,
      {
        type: "connections",
        links
      }
    ]
  };
}
