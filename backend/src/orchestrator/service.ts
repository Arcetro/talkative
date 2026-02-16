import { appendEvent } from "./store.js";
import { OrchestratorEventType } from "./types.js";

function mapAgentEventToOrchestratorType(agentEvent: string): OrchestratorEventType {
  if (agentEvent === "TOOL_RUN_STARTED") return "tool_started";
  if (agentEvent === "TOOL_RUN_FINISHED") return "tool_finished";
  if (agentEvent === "METRIC_RECORDED") return "metric_recorded";
  if (agentEvent === "WORKFLOW_PATCH_APPLIED" || agentEvent === "WORKFLOW_PATCH_PROPOSED") return "state_changed";
  if (agentEvent === "INTERPRETATION_RESULT") return "state_changed";
  return "state_changed";
}

export async function mirrorAgentEvent(input: {
  tenant_id: string;
  agent_id: string;
  run_id: string;
  event_type: string;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await appendEvent({
    tenant_id: input.tenant_id,
    agent_id: input.agent_id,
    run_id: input.run_id,
    type: mapAgentEventToOrchestratorType(input.event_type),
    message: input.message,
    payload: {
      source_event_type: input.event_type,
      ...input.payload
    }
  });
}
