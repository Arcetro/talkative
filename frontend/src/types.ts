export type NodeStatus = "pending" | "active" | "done";

export interface NodeMetrics {
  timeSpent: number;
  cost: number;
  notes: string;
}

export interface NodeContribution {
  executedBy?: string;
  estimatedEffort?: number;
  realTimeSpent?: number;
  valueContribution?: number;
}

export interface WorkflowNode {
  id: string;
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  assignedPerson?: string;
  status: NodeStatus;
  metrics: NodeMetrics;
  contribution?: NodeContribution;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowVersion {
  version: number;
  createdAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  note?: string;
}

export interface Workflow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  versions: WorkflowVersion[];
}

export interface InterpreterResult {
  detectedTasks: string[];
  suggestions: Array<
    | { type: "node"; name: string; description: string }
    | { type: "connections"; links: Array<{ sourceName: string; targetName: string }> }
  >;
}

export type AgentStatus = "running" | "stopped";

export interface AgentRecord {
  id: string;
  agent_id: string;
  tenant_id: string;
  name: string;
  workspace: string;
  status: AgentStatus;
  heartbeatMinutes: number;
  lastHeartbeatAt?: string | null;
  lastMessageAt?: string | null;
  lastMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface AgentEvent {
  id: string;
  tenant_id?: string;
  agent_id?: string;
  agentId: string;
  type:
    | "MESSAGE_RECEIVED"
    | "INTERPRETATION_RESULT"
    | "WORKFLOW_PATCH_PROPOSED"
    | "WORKFLOW_PATCH_APPLIED"
    | "TOOL_RUN_STARTED"
    | "TOOL_RUN_FINISHED"
    | "METRIC_RECORDED"
    | "HEARTBEAT_TICK"
    | "AGENT_CREATED"
    | "AGENT_STARTED"
    | "AGENT_STOPPED"
    | "SKILL_ATTACHED";
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowPatch {
  id: string;
  version: number;
  createdAt: string;
  operations: Array<{
    op: "add_node" | "update_node" | "remove_node" | "add_edge" | "update_edge" | "remove_edge";
    node?: { id: string; name: string; description?: string };
    edge?: { id: string; source: string; target: string };
    id?: string;
  }>;
  snapshot?: {
    nodes: Array<{ id: string; name: string; description?: string }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
}

export interface AgentMessageResponse {
  agentId: string;
  reply: string;
  interpretation?: InterpreterResult;
  workflowPatch?: WorkflowPatch;
  actions: Array<{ type: string; data?: Record<string, unknown> }>;
  events: AgentEvent[];
}

export interface RouterRuleSet {
  default_model: string;
  routes: Array<{ match: string; model: string; max_tokens: number }>;
  updated_at: string;
}

export interface RouterBudgetCaps {
  global_daily_cost_cap_usd: number;
  tenants: Record<string, { daily_cost_cap_usd: number; monthly_cost_cap_usd: number }>;
  agents: Record<string, { tenant_id: string; daily_cost_cap_usd: number; monthly_cost_cap_usd: number }>;
  updated_at: string;
}

export interface RouterUsageRecord {
  id: string;
  tenant_id: string;
  agent_id: string;
  model: string;
  tokens: number;
  cost: number;
  latency_ms: number;
  status: "ok" | "error";
  created_at: string;
}

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
