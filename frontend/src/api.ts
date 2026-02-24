import {
  ApprovalRequest,
  AgentEvent,
  AgentMessageResponse,
  AgentRecord,
  AgentSkill,
  InterpreterResult,
  RouterBudgetCaps,
  RouterRuleSet,
  RouterUsageRecord,
  Workflow,
  WorkflowEdge,
  WorkflowNode
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:4000";
const FALLBACK_TENANT_ID = "tenant-default";

function resolveTenantId(): string {
  const fromStorage =
    typeof window !== "undefined" ? window.localStorage.getItem("tenant_id") ?? window.localStorage.getItem("x-tenant-id") : null;
  return fromStorage?.trim() || FALLBACK_TENANT_ID;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("x-tenant-id")) {
    headers.set("x-tenant-id", resolveTenantId());
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function parseOrThrow<T>(response: Response, fallbackError: string): Promise<T> {
  if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? fallbackError);
    } catch {
      throw new Error(fallbackError);
    }
  }
  return response.json() as Promise<T>;
}

export async function saveWorkflow(payload: {
  id?: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): Promise<Workflow> {
  const response = await apiFetch("/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return parseOrThrow<Workflow>(response, "Failed to save workflow");
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const response = await apiFetch(`/workflow/${id}`);
  return parseOrThrow<Workflow>(response, "Workflow not found");
}

export async function interpretText(text: string): Promise<InterpreterResult> {
  const response = await apiFetch("/conversation/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: { type: "text", text } })
  });

  return parseOrThrow<InterpreterResult>(response, "Conversation interpretation failed");
}

export async function listAgents(): Promise<{ agents: AgentRecord[] }> {
  const response = await apiFetch("/agents");
  return parseOrThrow<{ agents: AgentRecord[] }>(response, "Failed to list agents");
}

export async function createAgent(payload: {
  id?: string;
  name: string;
  workspace?: string;
  template?: "mail-triage" | "git-watcher" | "monthly-bookkeeping";
}): Promise<AgentRecord> {
  const response = await apiFetch("/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseOrThrow<AgentRecord>(response, "Failed to create agent");
}

export async function startAgent(id: string): Promise<AgentRecord> {
  const response = await apiFetch(`/agents/${id}/start`, { method: "POST" });
  return parseOrThrow<AgentRecord>(response, "Failed to start agent");
}

export async function stopAgent(id: string): Promise<AgentRecord> {
  const response = await apiFetch(`/agents/${id}/stop`, { method: "POST" });
  return parseOrThrow<AgentRecord>(response, "Failed to stop agent");
}

export async function getAgentEvents(id: string, limit = 50): Promise<{ events: AgentEvent[] }> {
  const response = await apiFetch(`/agents/${id}/events?tail=${limit}`);
  return parseOrThrow<{ events: AgentEvent[] }>(response, "Failed to fetch agent events");
}

export async function getAgentSkills(id: string): Promise<{ skills: AgentSkill[] }> {
  const response = await apiFetch(`/agents/${id}/skills`);
  return parseOrThrow<{ skills: AgentSkill[] }>(response, "Failed to fetch agent skills");
}

export async function attachSkill(id: string, skillName: string): Promise<{ skills: AgentSkill[] }> {
  const response = await apiFetch(`/agents/${id}/skills/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillName })
  });

  return parseOrThrow<{ skills: AgentSkill[] }>(response, "Failed to attach skill");
}

export async function sendAgentMessage(id: string, message: string): Promise<AgentMessageResponse> {
  const response = await apiFetch(`/agents/${id}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  return parseOrThrow<AgentMessageResponse>(response, "Failed to send message");
}

export async function getRouterRules(): Promise<RouterRuleSet> {
  const response = await apiFetch("/router/admin/rules");
  return parseOrThrow<RouterRuleSet>(response, "Failed to fetch router rules");
}

export async function putRouterRules(payload: RouterRuleSet): Promise<RouterRuleSet> {
  const response = await apiFetch("/router/admin/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseOrThrow<RouterRuleSet>(response, "Failed to save router rules");
}

export async function getRouterUsage(params: {
  tenant_id?: string;
  agent_id?: string;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<{ usage: RouterUsageRecord[] }> {
  const query = new URLSearchParams();
  if (params.tenant_id) query.set("tenant_id", params.tenant_id);
  if (params.agent_id) query.set("agent_id", params.agent_id);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  const response = await apiFetch(`/router/admin/usage?${query.toString()}`);
  return parseOrThrow<{ usage: RouterUsageRecord[] }>(response, "Failed to fetch router usage");
}

export async function getRouterBudgets(): Promise<RouterBudgetCaps> {
  const response = await apiFetch("/router/admin/budgets");
  return parseOrThrow<RouterBudgetCaps>(response, "Failed to fetch router budgets");
}

export async function putRouterBudgets(payload: RouterBudgetCaps): Promise<RouterBudgetCaps> {
  const response = await apiFetch("/router/admin/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseOrThrow<RouterBudgetCaps>(response, "Failed to save router budgets");
}

export async function getRouterMetrics(): Promise<{
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  error_rate: number;
}> {
  const response = await apiFetch("/router/metrics");
  return parseOrThrow(response, "Failed to fetch router metrics");
}

export async function getApprovals(params: {
  tenant_id?: string;
  agent_id?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
}): Promise<{ approvals: ApprovalRequest[] }> {
  const query = new URLSearchParams();
  if (params.tenant_id) query.set("tenant_id", params.tenant_id);
  if (params.agent_id) query.set("agent_id", params.agent_id);
  if (params.status) query.set("status", params.status);
  if (params.limit) query.set("limit", String(params.limit));

  const response = await apiFetch(`/approvals?${query.toString()}`);
  return parseOrThrow<{ approvals: ApprovalRequest[] }>(response, "Failed to fetch approvals");
}

export async function decideApproval(input: {
  id: string;
  operator_id: string;
  decision: "approved" | "rejected";
  note?: string;
}): Promise<ApprovalRequest> {
  const response = await apiFetch(`/approvals/${input.id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operator_id: input.operator_id,
      decision: input.decision,
      note: input.note
    })
  });
  return parseOrThrow<ApprovalRequest>(response, "Failed to decide approval");
}
