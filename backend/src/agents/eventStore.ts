import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { publishEvent } from "../services/eventBus.js";
import { AGENTS_DATA_DIR } from "./paths.js";
import { AgentEvent } from "./types.js";

async function ensureDir(agentId: string): Promise<string> {
  const dir = path.join(AGENTS_DATA_DIR, agentId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function eventFile(agentId: string): string {
  return path.join(AGENTS_DATA_DIR, agentId, "events.jsonl");
}

export async function appendAgentEvent(input: Omit<AgentEvent, "id" | "timestamp"> & { timestamp?: string }): Promise<AgentEvent> {
  const dir = await ensureDir(input.agentId);
  const event: AgentEvent = {
    id: nanoid(10),
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...input
  };

  await fs.appendFile(path.join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  publishEvent({
    type: "workflow.updated",
    timestamp: event.timestamp,
    payload: {
      channel: "agent",
      tenant_id: event.tenant_id,
      agent_id: event.agent_id,
      agentId: event.agentId,
      eventType: event.type,
      message: event.message
    }
  });
  return event;
}

export async function readAgentEvents(agentId: string, limit = 50): Promise<AgentEvent[]> {
  const filePath = eventFile(agentId);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as AgentEvent);
  } catch {
    return [];
  }
}
