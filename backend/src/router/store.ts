import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "../agents/paths.js";
import { recordRouterUsage } from "../observability/metrics.js";
import { BudgetCaps, RouterRuleSet, RouterUsageRecord } from "./types.js";

const ROUTER_DIR = path.join(DATA_ROOT, "llm-router");
const RULES_FILE = path.join(ROUTER_DIR, "rules.json");
const BUDGETS_FILE = path.join(ROUTER_DIR, "budgets.json");
const USAGE_FILE = path.join(ROUTER_DIR, "usage.jsonl");

const DEFAULT_RULES: RouterRuleSet = {
  default_model: "gpt-4o-mini",
  routes: [
    { match: "triage|email|inbox", model: "gpt-4o-mini", max_tokens: 800 },
    { match: "workflow|process|node", model: "gpt-4o-mini", max_tokens: 900 }
  ],
  updated_at: new Date().toISOString()
};

const DEFAULT_BUDGETS: BudgetCaps = {
  global_daily_cost_cap_usd: 25,
  tenants: {
    "tenant-default": { daily_cost_cap_usd: 10, monthly_cost_cap_usd: 150 }
  },
  agents: {},
  updated_at: new Date().toISOString()
};

async function ensureFiles(): Promise<void> {
  await fs.mkdir(ROUTER_DIR, { recursive: true });
  try {
    await fs.access(RULES_FILE);
  } catch {
    await fs.writeFile(RULES_FILE, JSON.stringify(DEFAULT_RULES, null, 2), "utf8");
  }

  try {
    await fs.access(BUDGETS_FILE);
  } catch {
    await fs.writeFile(BUDGETS_FILE, JSON.stringify(DEFAULT_BUDGETS, null, 2), "utf8");
  }

  try {
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(USAGE_FILE, "", "utf8");
  }
}

export async function getRules(): Promise<RouterRuleSet> {
  await ensureFiles();
  const raw = await fs.readFile(RULES_FILE, "utf8");
  return JSON.parse(raw) as RouterRuleSet;
}

export async function putRules(rules: RouterRuleSet): Promise<RouterRuleSet> {
  await ensureFiles();
  const next: RouterRuleSet = { ...rules, updated_at: new Date().toISOString() };
  await fs.writeFile(RULES_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function getBudgets(): Promise<BudgetCaps> {
  await ensureFiles();
  const raw = await fs.readFile(BUDGETS_FILE, "utf8");
  return JSON.parse(raw) as BudgetCaps;
}

export async function putBudgets(budgets: BudgetCaps): Promise<BudgetCaps> {
  await ensureFiles();
  const next: BudgetCaps = { ...budgets, updated_at: new Date().toISOString() };
  await fs.writeFile(BUDGETS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function appendUsage(input: Omit<RouterUsageRecord, "id" | "created_at">): Promise<RouterUsageRecord> {
  await ensureFiles();
  const record: RouterUsageRecord = {
    id: nanoid(12),
    created_at: new Date().toISOString(),
    ...input
  };
  await fs.appendFile(USAGE_FILE, `${JSON.stringify(record)}\n`, "utf8");
  recordRouterUsage({ tokens: record.tokens, cost: record.cost });
  return record;
}

export async function getUsage(filter: {
  tenant_id?: string;
  agent_id?: string;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<RouterUsageRecord[]> {
  await ensureFiles();
  const raw = await fs.readFile(USAGE_FILE, "utf8");
  const all = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RouterUsageRecord)
    .filter((row) => (filter.tenant_id ? row.tenant_id === filter.tenant_id : true))
    .filter((row) => (filter.agent_id ? row.agent_id === filter.agent_id : true))
    .filter((row) => (filter.from ? row.created_at >= filter.from : true))
    .filter((row) => (filter.to ? row.created_at <= filter.to : true));

  const limit = filter.limit ?? 100;
  return all.slice(-limit);
}

export async function getMetrics(): Promise<{
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  error_rate: number;
}> {
  const usage = await getUsage({ limit: 100000 });
  const total_requests = usage.length;
  const total_tokens = usage.reduce((sum, row) => sum + row.tokens, 0);
  const total_cost = usage.reduce((sum, row) => sum + row.cost, 0);
  const errors = usage.filter((row) => row.status === "error").length;

  return {
    total_requests,
    total_tokens,
    total_cost,
    error_rate: total_requests === 0 ? 0 : errors / total_requests
  };
}
