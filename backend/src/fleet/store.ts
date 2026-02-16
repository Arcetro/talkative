import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "../agents/paths.js";
import { AgentRecord } from "../agents/types.js";
import { CloudPool, NodeHost, Tenant } from "./types.js";

const DATA_DIR = DATA_ROOT;
const TENANTS_FILE = path.join(DATA_DIR, "tenants.json");
const CLOUDS_FILE = path.join(DATA_DIR, "clouds.json");
const NODES_FILE = path.join(DATA_DIR, "nodes.json");
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");

async function ensureFile(filePath: string, key: string): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify({ [key]: [] }, null, 2), "utf8");
  }
}

async function readList<T>(filePath: string, key: string): Promise<T[]> {
  await ensureFile(filePath, key);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, T[]>;
  return parsed[key] ?? [];
}

async function writeList<T>(filePath: string, key: string, items: T[]): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify({ [key]: items }, null, 2), "utf8");
}

export async function upsertTenant(input: { tenant_id: string; name: string }): Promise<Tenant> {
  const tenants = await readList<Tenant>(TENANTS_FILE, "tenants");
  const existing = tenants.find((row) => row.tenant_id === input.tenant_id);
  if (existing) return existing;

  const created: Tenant = {
    id: nanoid(8),
    tenant_id: input.tenant_id,
    agent_id: "system-fleet",
    name: input.name,
    created_at: new Date().toISOString()
  };
  tenants.push(created);
  await writeList(TENANTS_FILE, "tenants", tenants);
  return created;
}

export async function upsertCloud(input: {
  tenant_id: string;
  name: string;
  provider?: CloudPool["provider"];
  region?: string;
}): Promise<CloudPool> {
  const clouds = await readList<CloudPool>(CLOUDS_FILE, "clouds");
  const existing = clouds.find((row) => row.tenant_id === input.tenant_id && row.name === input.name);
  if (existing) return existing;

  const created: CloudPool = {
    id: nanoid(8),
    tenant_id: input.tenant_id,
    agent_id: "system-fleet",
    name: input.name,
    provider: input.provider ?? "local",
    region: input.region ?? "local",
    created_at: new Date().toISOString()
  };
  clouds.push(created);
  await writeList(CLOUDS_FILE, "clouds", clouds);
  return created;
}

export async function createNode(input: Omit<NodeHost, "id" | "created_at">): Promise<NodeHost> {
  const nodes = await readList<NodeHost>(NODES_FILE, "nodes");
  const created: NodeHost = {
    ...input,
    id: nanoid(8),
    created_at: new Date().toISOString()
  };
  nodes.push(created);
  await writeList(NODES_FILE, "nodes", nodes);
  return created;
}

export async function listNodes(): Promise<NodeHost[]> {
  return readList<NodeHost>(NODES_FILE, "nodes");
}

export async function getNode(id: string): Promise<NodeHost | undefined> {
  const nodes = await listNodes();
  return nodes.find((row) => row.id === id);
}

export async function listClouds(): Promise<CloudPool[]> {
  return readList<CloudPool>(CLOUDS_FILE, "clouds");
}

export async function listTenants(): Promise<Tenant[]> {
  return readList<Tenant>(TENANTS_FILE, "tenants");
}

export async function listAgents(): Promise<AgentRecord[]> {
  return readList<AgentRecord>(AGENTS_FILE, "agents");
}

export async function patchAgent(input: { agent_id: string; updates: Partial<AgentRecord> }): Promise<AgentRecord | null> {
  const agents = await listAgents();
  const idx = agents.findIndex((row) => row.agent_id === input.agent_id || row.id === input.agent_id);
  if (idx < 0) return null;
  agents[idx] = {
    ...agents[idx],
    ...input.updates,
    id: agents[idx].id,
    agent_id: agents[idx].agent_id ?? agents[idx].id
  };
  await writeList(AGENTS_FILE, "agents", agents);
  return agents[idx];
}
