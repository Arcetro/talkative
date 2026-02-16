import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "../agents/paths.js";

export interface ClientMessageRecord {
  id: string;
  tenant_id: string;
  agent_id: string;
  client_id: string;
  text: string;
  run_id: string;
  created_at: string;
}

export interface InternalActionRecord {
  id: string;
  tenant_id: string;
  agent_id: string;
  operator_id: string;
  action: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

const CHANNELS_DIR = path.join(DATA_ROOT, "channels");
const CLIENT_FILE = path.join(CHANNELS_DIR, "client-messages.jsonl");
const INTERNAL_FILE = path.join(CHANNELS_DIR, "internal-actions.jsonl");

async function ensure(): Promise<void> {
  await fs.mkdir(CHANNELS_DIR, { recursive: true });
  try {
    await fs.access(CLIENT_FILE);
  } catch {
    await fs.writeFile(CLIENT_FILE, "", "utf8");
  }
  try {
    await fs.access(INTERNAL_FILE);
  } catch {
    await fs.writeFile(INTERNAL_FILE, "", "utf8");
  }
}

export async function appendClientMessage(input: Omit<ClientMessageRecord, "id" | "created_at">): Promise<ClientMessageRecord> {
  await ensure();
  const row: ClientMessageRecord = { id: nanoid(12), created_at: new Date().toISOString(), ...input };
  await fs.appendFile(CLIENT_FILE, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

export async function appendInternalAction(input: Omit<InternalActionRecord, "id" | "created_at">): Promise<InternalActionRecord> {
  await ensure();
  const row: InternalActionRecord = { id: nanoid(12), created_at: new Date().toISOString(), ...input };
  await fs.appendFile(INTERNAL_FILE, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

export async function listClientMessages(filter: {
  tenant_id?: string;
  agent_id?: string;
  limit?: number;
}): Promise<ClientMessageRecord[]> {
  await ensure();
  const raw = await fs.readFile(CLIENT_FILE, "utf8");
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ClientMessageRecord)
    .filter((row) => (filter.tenant_id ? row.tenant_id === filter.tenant_id : true))
    .filter((row) => (filter.agent_id ? row.agent_id === filter.agent_id : true));

  return rows.slice(-(filter.limit ?? 100));
}
