import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { BACKEND_ROOT } from "../agents/paths.js";

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  agent_id: string;
  run_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  decided_at?: string;
  decided_by?: string;
  note?: string;
}

const APPROVAL_DIR = path.join(BACKEND_ROOT, "data", "approvals");
const APPROVAL_FILE = path.join(APPROVAL_DIR, "requests.json");

async function ensure(): Promise<void> {
  await fs.mkdir(APPROVAL_DIR, { recursive: true });
  try {
    await fs.access(APPROVAL_FILE);
  } catch {
    await fs.writeFile(APPROVAL_FILE, JSON.stringify({ requests: [] }, null, 2), "utf8");
  }
}

async function readAll(): Promise<ApprovalRequest[]> {
  await ensure();
  const raw = await fs.readFile(APPROVAL_FILE, "utf8");
  return (JSON.parse(raw) as { requests: ApprovalRequest[] }).requests;
}

async function writeAll(requests: ApprovalRequest[]): Promise<void> {
  await fs.writeFile(APPROVAL_FILE, JSON.stringify({ requests }, null, 2), "utf8");
}

export async function createApproval(input: {
  tenant_id: string;
  agent_id: string;
  run_id: string;
  reason: string;
}): Promise<ApprovalRequest> {
  const requests = await readAll();
  const created: ApprovalRequest = {
    id: nanoid(10),
    tenant_id: input.tenant_id,
    agent_id: input.agent_id,
    run_id: input.run_id,
    reason: input.reason,
    status: "pending",
    requested_at: new Date().toISOString()
  };
  requests.push(created);
  await writeAll(requests);
  return created;
}

export async function decideApproval(input: {
  id: string;
  operator_id: string;
  decision: "approved" | "rejected";
  note?: string;
}): Promise<ApprovalRequest> {
  const requests = await readAll();
  const idx = requests.findIndex((r) => r.id === input.id);
  if (idx < 0) throw new Error("Approval request not found");

  requests[idx] = {
    ...requests[idx],
    status: input.decision,
    decided_at: new Date().toISOString(),
    decided_by: input.operator_id,
    note: input.note
  };

  await writeAll(requests);
  return requests[idx];
}

export async function listApprovals(filter: {
  tenant_id?: string;
  agent_id?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
}): Promise<ApprovalRequest[]> {
  const requests = await readAll();
  const filtered = requests
    .filter((r) => (filter.tenant_id ? r.tenant_id === filter.tenant_id : true))
    .filter((r) => (filter.agent_id ? r.agent_id === filter.agent_id : true))
    .filter((r) => (filter.status ? r.status === filter.status : true));

  return filtered.slice(-(filter.limit ?? 100));
}
