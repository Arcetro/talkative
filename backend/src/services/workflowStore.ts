import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Workflow, WorkflowEdge, WorkflowNode, WorkflowVersion } from "../domain/types.js";
import { publishEvent } from "./eventBus.js";

interface StoreData {
  workflows: Workflow[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "workflows.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const seed: StoreData = { workflows: [] };
    await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function readStore(): Promise<StoreData> {
  await ensureStore();
  const content = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(content) as StoreData;
  parsed.workflows = parsed.workflows.map((workflow) => ({
    ...workflow,
    tenant_id: workflow.tenant_id ?? "tenant-default"
  }));
  return parsed;
}

async function writeStore(data: StoreData): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function buildVersion(version: number, nodes: WorkflowNode[], edges: WorkflowEdge[], note?: string): WorkflowVersion {
  return {
    version,
    createdAt: new Date().toISOString(),
    nodes,
    edges,
    note
  };
}

export async function createOrUpdateWorkflow(input: {
  id?: string;
  tenant_id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): Promise<Workflow> {
  const store = await readStore();
  const now = new Date().toISOString();

  if (!input.id) {
    const workflowId = nanoid(8);
    const created: Workflow = {
      id: workflowId,
      tenant_id: input.tenant_id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      versions: [buildVersion(1, input.nodes, input.edges, "Initial version")]
    };
    store.workflows.push(created);
    await writeStore(store);
    publishEvent({
      type: "workflow.created",
      timestamp: new Date().toISOString(),
      payload: { workflowId: created.id, version: 1 }
    });
    return created;
  }

  const existing = store.workflows.find((w) => w.id === input.id);
  if (!existing) {
    const created: Workflow = {
      id: input.id,
      tenant_id: input.tenant_id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      versions: [buildVersion(1, input.nodes, input.edges, "Imported version")]
    };
    store.workflows.push(created);
    await writeStore(store);
    return created;
  }
  if (existing.tenant_id !== input.tenant_id) {
    throw new Error("Workflow does not belong to request tenant");
  }

  const latestVersion = existing.versions.at(-1);
  const nextVersionNumber = (latestVersion?.version ?? 0) + 1;
  existing.name = input.name;
  existing.updatedAt = now;
  existing.versions.push(buildVersion(nextVersionNumber, input.nodes, input.edges, "Workflow saved from editor"));

  await writeStore(store);
  publishEvent({
    type: "workflow.updated",
    timestamp: new Date().toISOString(),
    payload: { workflowId: existing.id, version: nextVersionNumber }
  });
  return existing;
}

export async function getWorkflowById(id: string, tenant_id: string): Promise<Workflow | null> {
  const store = await readStore();
  return store.workflows.find((w) => w.id === id && w.tenant_id === tenant_id) ?? null;
}

export async function createNode(input: { tenant_id: string; workflowId: string; node: WorkflowNode }): Promise<WorkflowNode> {
  const store = await readStore();
  const workflow = store.workflows.find((w) => w.id === input.workflowId && w.tenant_id === input.tenant_id);
  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const latest = workflow.versions.at(-1);
  if (!latest) throw new Error("Workflow has no versions");

  const nextNodes = [...latest.nodes, input.node];
  const nextVersion = buildVersion(latest.version + 1, nextNodes, latest.edges, `Node ${input.node.id} created`);

  workflow.updatedAt = new Date().toISOString();
  workflow.versions.push(nextVersion);

  await writeStore(store);
  publishEvent({
    type: "node.created",
    timestamp: new Date().toISOString(),
    payload: { workflowId: workflow.id, nodeId: input.node.id, version: nextVersion.version }
  });
  return input.node;
}

export async function patchNode(input: {
  tenant_id: string;
  nodeId: string;
  workflowId: string;
  updates: Partial<WorkflowNode>;
}): Promise<WorkflowNode> {
  const store = await readStore();
  const workflow = store.workflows.find((w) => w.id === input.workflowId && w.tenant_id === input.tenant_id);
  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const latest = workflow.versions.at(-1);
  if (!latest) throw new Error("Workflow has no versions");

  const nodeIndex = latest.nodes.findIndex((n) => n.id === input.nodeId);
  if (nodeIndex < 0) throw new Error("Node not found");

  const updatedNode = {
    ...latest.nodes[nodeIndex],
    ...input.updates,
    id: input.nodeId
  };

  const nextNodes = [...latest.nodes];
  nextNodes[nodeIndex] = updatedNode;

  const nextVersion = buildVersion(latest.version + 1, nextNodes, latest.edges, `Node ${input.nodeId} patched`);

  workflow.updatedAt = new Date().toISOString();
  workflow.versions.push(nextVersion);

  await writeStore(store);
  publishEvent({
    type: "node.updated",
    timestamp: new Date().toISOString(),
    payload: { workflowId: workflow.id, nodeId: input.nodeId, version: nextVersion.version }
  });
  return updatedNode;
}
