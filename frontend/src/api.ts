import {
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

const API_BASE = "http://localhost:4000";

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
  const response = await fetch(`${API_BASE}/workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return parseOrThrow<Workflow>(response, "Failed to save workflow");
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const response = await fetch(`${API_BASE}/workflow/${id}`);
  return parseOrThrow<Workflow>(response, "Workflow not found");
}

export async function interpretText(text: string): Promise<InterpreterResult> {
  const response = await fetch(`${API_BASE}/conversation/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: { type: "text", text } })
  });

  return parseOrThrow<InterpreterResult>(response, "Conversation interpretation failed");
}

export async function listAgents(): Promise<{ agents: AgentRecord[] }> {
  const response = await fetch(`${API_BASE}/agents`);
  return parseOrThrow<{ agents: AgentRecord[] }>(response, "Failed to list agents");
}

export async function createAgent(payload: {
  id?: string;
  name: string;
  workspace?: string;
  template?: "mail-triage" | "git-watcher" | "monthly-bookkeeping";
}): Promise<AgentRecord> {
  const response = await fetch(`${API_BASE}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseOrThrow<AgentRecord>(response, "Failed to create agent");
}

export async function startAgent(id: string): Promise<AgentRecord> {
  const response = await fetch(`${API_BASE}/agents/${id}/start`, { method: "POST" });
  return parseOrThrow<AgentRecord>(response, "Failed to start agent");
}

export async function stopAgent(id: string): Promise<AgentRecord> {
  const response = await fetch(`${API_BASE}/agents/${id}/stop`, { method: "POST" });
  return parseOrThrow<AgentRecord>(response, "Failed to stop agent");
}

export async function getAgentEvents(id: string, limit = 50): Promise<{ events: AgentEvent[] }> {
  const response = await fetch(`${API_BASE}/agents/${id}/events?tail=${limit}`);
  return parseOrThrow<{ events: AgentEvent[] }>(response, "Failed to fetch agent events");
}

export async function getAgentSkills(id: string): Promise<{ skills: AgentSkill[] }> {
  const response = await fetch(`${API_BASE}/agents/${id}/skills`);
  return parseOrThrow<{ skills: AgentSkill[] }>(response, "Failed to fetch agent skills");
}

export async function attachSkill(id: string, skillName: string): Promise<{ skills: AgentSkill[] }> {
  const response = await fetch(`${API_BASE}/agents/${id}/skills/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillName })
  });

  return parseOrThrow<{ skills: AgentSkill[] }>(response, "Failed to attach skill");
}

export async function sendAgentMessage(id: string, message: string): Promise<AgentMessageResponse> {
  const response = await fetch(`${API_BASE}/agents/${id}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  return parseOrThrow<AgentMessageResponse>(response, "Failed to send message");
}

export async function getRouterRules(): Promise<RouterRuleSet> {
  const response = await fetch(`${API_BASE}/router/admin/rules`);
  return parseOrThrow<RouterRuleSet>(response, "Failed to fetch router rules");
}

export async function putRouterRules(payload: RouterRuleSet): Promise<RouterRuleSet> {
  const response = await fetch(`${API_BASE}/router/admin/rules`, {
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

  const response = await fetch(`${API_BASE}/router/admin/usage?${query.toString()}`);
  return parseOrThrow<{ usage: RouterUsageRecord[] }>(response, "Failed to fetch router usage");
}

export async function getRouterBudgets(): Promise<RouterBudgetCaps> {
  const response = await fetch(`${API_BASE}/router/admin/budgets`);
  return parseOrThrow<RouterBudgetCaps>(response, "Failed to fetch router budgets");
}

export async function putRouterBudgets(payload: RouterBudgetCaps): Promise<RouterBudgetCaps> {
  const response = await fetch(`${API_BASE}/router/admin/budgets`, {
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
  const response = await fetch(`${API_BASE}/router/metrics`);
  return parseOrThrow(response, "Failed to fetch router metrics");
}
