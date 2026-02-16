export interface RouterRuleSet {
  default_model: string;
  routes: Array<{
    match: string;
    model: string;
    max_tokens: number;
  }>;
  updated_at: string;
}

export interface BudgetCaps {
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
