import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "../agents/paths.js";
import { recordRouterUsage } from "../observability/metrics.js";
import { getPrismaClient } from "../persistence/prisma.js";
import { isDatabasePersistenceEnabled } from "../persistence/config.js";
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
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const row = await prisma.routerRule.findUnique({ where: { id: "active" } });
    if (!row) {
      await prisma.routerRule.create({
        data: {
          id: "active",
          defaultModel: DEFAULT_RULES.default_model,
          routes: DEFAULT_RULES.routes,
          updatedAt: new Date()
        }
      });
      return DEFAULT_RULES;
    }
    return {
      default_model: row.defaultModel,
      routes: row.routes as RouterRuleSet["routes"],
      updated_at: row.updatedAt.toISOString()
    };
  }

  await ensureFiles();
  const raw = await fs.readFile(RULES_FILE, "utf8");
  return JSON.parse(raw) as RouterRuleSet;
}

export async function putRules(rules: RouterRuleSet): Promise<RouterRuleSet> {
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const updatedAt = new Date();
    await prisma.routerRule.upsert({
      where: { id: "active" },
      create: {
        id: "active",
        defaultModel: rules.default_model,
        routes: rules.routes,
        updatedAt
      },
      update: {
        defaultModel: rules.default_model,
        routes: rules.routes,
        updatedAt
      }
    });
    return { ...rules, updated_at: updatedAt.toISOString() };
  }

  await ensureFiles();
  const next: RouterRuleSet = { ...rules, updated_at: new Date().toISOString() };
  await fs.writeFile(RULES_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function getBudgets(): Promise<BudgetCaps> {
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const row = await prisma.routerBudget.findUnique({ where: { id: "active" } });
    if (!row) {
      await prisma.routerBudget.create({
        data: {
          id: "active",
          globalDailyCostCapUsd: DEFAULT_BUDGETS.global_daily_cost_cap_usd,
          tenants: DEFAULT_BUDGETS.tenants,
          agents: DEFAULT_BUDGETS.agents,
          updatedAt: new Date()
        }
      });
      return DEFAULT_BUDGETS;
    }
    return {
      global_daily_cost_cap_usd: row.globalDailyCostCapUsd,
      tenants: row.tenants as BudgetCaps["tenants"],
      agents: row.agents as BudgetCaps["agents"],
      updated_at: row.updatedAt.toISOString()
    };
  }

  await ensureFiles();
  const raw = await fs.readFile(BUDGETS_FILE, "utf8");
  return JSON.parse(raw) as BudgetCaps;
}

export async function putBudgets(budgets: BudgetCaps): Promise<BudgetCaps> {
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const updatedAt = new Date();
    await prisma.routerBudget.upsert({
      where: { id: "active" },
      create: {
        id: "active",
        globalDailyCostCapUsd: budgets.global_daily_cost_cap_usd,
        tenants: budgets.tenants,
        agents: budgets.agents,
        updatedAt
      },
      update: {
        globalDailyCostCapUsd: budgets.global_daily_cost_cap_usd,
        tenants: budgets.tenants,
        agents: budgets.agents,
        updatedAt
      }
    });
    return { ...budgets, updated_at: updatedAt.toISOString() };
  }

  await ensureFiles();
  const next: BudgetCaps = { ...budgets, updated_at: new Date().toISOString() };
  await fs.writeFile(BUDGETS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function appendUsage(input: Omit<RouterUsageRecord, "id" | "created_at">): Promise<RouterUsageRecord> {
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const createdAt = new Date();
    const id = nanoid(12);
    await prisma.routerUsage.create({
      data: {
        id,
        tenantId: input.tenant_id,
        agentId: input.agent_id,
        model: input.model,
        tokens: input.tokens,
        cost: input.cost,
        latencyMs: input.latency_ms,
        status: input.status,
        createdAt
      }
    });
    recordRouterUsage({ tokens: input.tokens, cost: input.cost });
    return {
      id,
      tenant_id: input.tenant_id,
      agent_id: input.agent_id,
      model: input.model,
      tokens: input.tokens,
      cost: input.cost,
      latency_ms: input.latency_ms,
      status: input.status,
      created_at: createdAt.toISOString()
    };
  }

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
  if (isDatabasePersistenceEnabled()) {
    const prisma = getPrismaClient();
    const rows = await prisma.routerUsage.findMany({
      where: {
        tenantId: filter.tenant_id,
        agentId: filter.agent_id,
        createdAt: {
          gte: filter.from ? new Date(filter.from) : undefined,
          lte: filter.to ? new Date(filter.to) : undefined
        }
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100
    });
    return rows
      .map(
        (row): RouterUsageRecord => ({
          id: row.id,
          tenant_id: row.tenantId,
          agent_id: row.agentId,
          model: row.model,
          tokens: row.tokens,
          cost: row.cost,
          latency_ms: row.latencyMs,
          status: row.status as RouterUsageRecord["status"],
          created_at: row.createdAt.toISOString()
        })
      )
      .reverse();
  }

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
