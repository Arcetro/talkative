import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "../agents/paths.js";
import { reduceRunStatus, reduceSubagentState } from "./stateMachine.js";
import { OrchestratorCommand, OrchestratorEvent, RunRecord } from "./types.js";

const ORCH_DIR = path.join(DATA_ROOT, "orchestrator");
const COMMANDS_FILE = path.join(ORCH_DIR, "commands.jsonl");
const EVENTS_FILE = path.join(ORCH_DIR, "events.jsonl");
const RUNS_FILE = path.join(ORCH_DIR, "runs.json");

async function ensure(): Promise<void> {
  await fs.mkdir(ORCH_DIR, { recursive: true });
  try {
    await fs.access(COMMANDS_FILE);
  } catch {
    await fs.writeFile(COMMANDS_FILE, "", "utf8");
  }
  try {
    await fs.access(EVENTS_FILE);
  } catch {
    await fs.writeFile(EVENTS_FILE, "", "utf8");
  }
  try {
    await fs.access(RUNS_FILE);
  } catch {
    await fs.writeFile(RUNS_FILE, JSON.stringify({ runs: [] }, null, 2), "utf8");
  }
}

async function readRuns(): Promise<RunRecord[]> {
  await ensure();
  const raw = await fs.readFile(RUNS_FILE, "utf8");
  return (JSON.parse(raw) as { runs: RunRecord[] }).runs;
}

async function writeRuns(runs: RunRecord[]): Promise<void> {
  await fs.writeFile(RUNS_FILE, JSON.stringify({ runs }, null, 2), "utf8");
}

function ensureRun(runs: RunRecord[], input: { run_id: string; tenant_id: string; agent_id: string }): RunRecord {
  const found = runs.find((run) => run.run_id === input.run_id);
  if (found) return found;

  const created: RunRecord = {
    run_id: input.run_id,
    tenant_id: input.tenant_id,
    agent_id: input.agent_id,
    status: "pending",
    subagent_state: "idle",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    steps: []
  };
  runs.push(created);
  return created;
}

export async function appendCommand(input: Omit<OrchestratorCommand, "id" | "created_at">): Promise<OrchestratorCommand> {
  await ensure();
  const row: OrchestratorCommand = {
    id: nanoid(12),
    created_at: new Date().toISOString(),
    ...input
  };
  await fs.appendFile(COMMANDS_FILE, `${JSON.stringify(row)}\n`, "utf8");

  const runs = await readRuns();
  const run = ensureRun(runs, row);
  run.status = reduceRunStatus(run.status, { command: row.type });
  run.subagent_state = reduceSubagentState(run.subagent_state, { command: row.type });
  run.updated_at = new Date().toISOString();
  run.steps.push({ id: nanoid(10), type: "command", name: row.type, at: row.created_at, payload: row.payload });
  await writeRuns(runs);

  return row;
}

export async function appendEvent(input: Omit<OrchestratorEvent, "id" | "created_at">): Promise<OrchestratorEvent> {
  await ensure();
  const row: OrchestratorEvent = {
    id: nanoid(12),
    created_at: new Date().toISOString(),
    ...input
  };
  await fs.appendFile(EVENTS_FILE, `${JSON.stringify(row)}\n`, "utf8");

  const runs = await readRuns();
  const run = ensureRun(runs, row);
  run.status = reduceRunStatus(run.status, { event: row.type });
  run.subagent_state = reduceSubagentState(run.subagent_state, { event: row.type });
  run.updated_at = new Date().toISOString();
  if (row.type === "error_compacted") {
    run.last_error = row.message;
  }
  run.steps.push({ id: nanoid(10), type: "event", name: row.type, at: row.created_at, payload: row.payload });
  await writeRuns(runs);

  return row;
}

export async function getRun(run_id: string, tenant_id?: string): Promise<RunRecord | null> {
  const runs = await readRuns();
  return runs.find((run) => run.run_id === run_id && (tenant_id ? run.tenant_id === tenant_id : true)) ?? null;
}

export async function listRuns(filter: { tenant_id?: string; agent_id?: string; limit?: number }): Promise<RunRecord[]> {
  const runs = await readRuns();
  const filtered = runs
    .filter((run) => (filter.tenant_id ? run.tenant_id === filter.tenant_id : true))
    .filter((run) => (filter.agent_id ? run.agent_id === filter.agent_id : true));

  return filtered.slice(-(filter.limit ?? 100));
}

/**
 * Return the most recent active run for an agent.
 * "Active" means status is running or paused (not completed/cancelled/failed).
 * Returns null if the agent has no active runs.
 */
export async function getActiveRunForAgent(agent_id: string): Promise<RunRecord | null> {
  const runs = await readRuns();
  const active = runs
    .filter((run) => run.agent_id === agent_id)
    .filter((run) => run.status === "running" || run.status === "paused" || run.status === "pending")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return active[0] ?? null;
}
