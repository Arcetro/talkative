import { OrchestratorCommandType, OrchestratorEventType, RunStatus, SubagentState } from "./types.js";

export function reduceRunStatus(current: RunStatus, input: { command?: OrchestratorCommandType; event?: OrchestratorEventType }): RunStatus {
  if (input.command === "start_task") return "running";
  if (input.command === "pause" && current === "running") return "paused";
  if (input.command === "resume" && current === "paused") return "running";
  if (input.command === "cancel") return "cancelled";

  if (input.event === "error_compacted") return "failed";
  if (input.event === "tool_finished" && current === "running") return "running";

  return current;
}

export function reduceSubagentState(
  current: SubagentState,
  input: { command?: OrchestratorCommandType; event?: OrchestratorEventType }
): SubagentState {
  if (input.command === "start_task" || input.command === "resume") return "running";
  if (input.command === "pause") return "paused";
  if (input.command === "cancel") return "stopped";

  if (input.event === "tool_started") return "running";
  if (input.event === "error_compacted") return "error";

  return current;
}
