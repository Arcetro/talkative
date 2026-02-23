import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getPrismaClient } from "../persistence/prisma.js";
import { isDatabasePersistenceEnabled } from "../persistence/config.js";
import { publishEvent } from "../services/eventBus.js";
import { recordAgentEvent } from "../observability/metrics.js";
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
  const event: AgentEvent = {
    id: nanoid(10),
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...input
  };

  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    await prisma.agentEvent.create({
      data: {
        id: event.id,
        tenantId: event.tenant_id,
        agentId: event.agent_id,
        agentRef: event.agentId,
        type: event.type,
        message: event.message,
        payload: event.payload ? (event.payload as Prisma.InputJsonValue) : undefined,
        timestamp: new Date(event.timestamp)
      }
    });
  } else {
    const dir = await ensureDir(input.agentId);
    await fs.appendFile(path.join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  }

  recordAgentEvent(event.type, event.payload);
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
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const rows = await prisma.agentEvent.findMany({
      where: { agentRef: agentId },
      orderBy: { timestamp: "desc" },
      take: limit
    });
    return rows
      .map(
        (row): AgentEvent => ({
          id: row.id,
          tenant_id: row.tenantId,
          agent_id: row.agentId,
          agentId: row.agentRef,
          type: row.type as AgentEvent["type"],
          message: row.message,
          payload: (row.payload as Record<string, unknown> | null) ?? undefined,
          timestamp: row.timestamp.toISOString()
        })
      )
      .reverse();
  }

  const filePath = eventFile(agentId);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as AgentEvent);
  } catch {
    return [];
  }
}

/**
 * Count total events stored for an agent without parsing them.
 */
export async function countAgentEvents(agentId: string): Promise<number> {
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    return prisma.agentEvent.count({ where: { agentRef: agentId } });
  }

  const filePath = eventFile(agentId);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Prune the event log, keeping only the most recent `keep` events.
 *
 * Returns the number of events removed. If the log has fewer than `keep`
 * events, no pruning occurs and 0 is returned.
 *
 * This is safe to call at any time — it atomically rewrites the file.
 */
export async function pruneAgentEvents(agentId: string, keep: number): Promise<number> {
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const rows = await prisma.agentEvent.findMany({
      where: { agentRef: agentId },
      orderBy: { timestamp: "desc" },
      skip: keep,
      select: { id: true }
    });
    if (!rows.length) return 0;
    const ids = rows.map((row) => row.id);
    await prisma.agentEvent.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  }

  const filePath = eventFile(agentId);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length <= keep) return 0;

    const removed = lines.length - keep;
    const retained = lines.slice(-keep);
    await fs.writeFile(filePath, retained.join("\n") + "\n", "utf8");
    return removed;
  } catch {
    return 0;
  }
}

/** Default threshold: prune when log exceeds this many events. */
export const PRUNE_THRESHOLD = 500;
/** After pruning, keep this many recent events. */
export const PRUNE_KEEP = 200;

/**
 * Auto-prune if the event log exceeds PRUNE_THRESHOLD.
 * Intended to be called after appending events in hot paths
 * (heartbeat, tool runs) to prevent unbounded growth.
 *
 * Returns the number of events removed, or 0 if no pruning needed.
 */
export async function autoPruneIfNeeded(agentId: string): Promise<number> {
  const count = await countAgentEvents(agentId);
  if (count > PRUNE_THRESHOLD) {
    return pruneAgentEvents(agentId, PRUNE_KEEP);
  }
  return 0;
}
