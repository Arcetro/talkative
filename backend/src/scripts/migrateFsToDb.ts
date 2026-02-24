import { promises as fs } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { DATA_ROOT, AGENTS_DATA_DIR } from "../agents/paths.js";
import { getPrismaClient } from "../persistence/prisma.js";
import { AgentEvent, AgentRecord } from "../agents/types.js";
import { Workflow } from "../domain/types.js";
import { BudgetCaps, RouterRuleSet, RouterUsageRecord } from "../router/types.js";

type SectionReport = {
  scanned: number;
  imported: number;
  skipped: number;
  errors: number;
};

type MigrationReport = {
  startedAt: string;
  finishedAt?: string;
  dataRoot: string;
  agents: SectionReport;
  agentEvents: SectionReport;
  workflows: SectionReport;
  routerRules: SectionReport;
  routerBudgets: SectionReport;
  routerUsage: SectionReport;
};

function emptySection(): SectionReport {
  return { scanned: 0, imported: 0, skipped: 0, errors: 0 };
}

function parseArgs(argv: string[]): { reportPath?: string } {
  const reportIndex = argv.findIndex((arg) => arg === "--report");
  if (reportIndex >= 0 && argv[reportIndex + 1]) {
    return { reportPath: argv[reportIndex + 1] };
  }
  return {};
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

async function migrateAgents(report: MigrationReport): Promise<void> {
  const prisma = getPrismaClient();
  const filePath = path.join(DATA_ROOT, "agents.json");
  const parsed = await readJsonFile<{ agents: AgentRecord[] }>(filePath);
  const agents = parsed?.agents ?? [];
  report.agents.scanned = agents.length;

  for (const agent of agents) {
    try {
      const existing = await prisma.agent.findUnique({ where: { id: agent.id }, select: { id: true } });
      await prisma.agent.upsert({
        where: { id: agent.id },
        create: {
          id: agent.id,
          agentId: agent.agent_id ?? agent.id,
          tenantId: agent.tenant_id ?? "tenant-default",
          name: agent.name,
          workspace: agent.workspace,
          status: agent.status,
          heartbeatMinutes: agent.heartbeatMinutes,
          lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
          lastMessageAt: agent.lastMessageAt ? new Date(agent.lastMessageAt) : null,
          lastMessage: agent.lastMessage ?? null,
          createdAt: new Date(agent.createdAt),
          updatedAt: new Date(agent.updatedAt)
        },
        update: {
          agentId: agent.agent_id ?? agent.id,
          tenantId: agent.tenant_id ?? "tenant-default",
          name: agent.name,
          workspace: agent.workspace,
          status: agent.status,
          heartbeatMinutes: agent.heartbeatMinutes,
          lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
          lastMessageAt: agent.lastMessageAt ? new Date(agent.lastMessageAt) : null,
          lastMessage: agent.lastMessage ?? null,
          updatedAt: new Date(agent.updatedAt)
        }
      });
      if (existing) {
        report.agents.skipped += 1;
      } else {
        report.agents.imported += 1;
      }
    } catch {
      report.agents.errors += 1;
    }
  }
}

async function migrateAgentEvents(report: MigrationReport): Promise<void> {
  const prisma = getPrismaClient();
  const agentDirs = await fs.readdir(AGENTS_DATA_DIR).catch(() => []);

  for (const dirName of agentDirs) {
    const eventsPath = path.join(AGENTS_DATA_DIR, dirName, "events.jsonl");
    const rows = await readJsonlFile<AgentEvent>(eventsPath);
    report.agentEvents.scanned += rows.length;
    if (rows.length === 0) continue;

    try {
      const result = await prisma.agentEvent.createMany({
        data: rows.map((row) => ({
          id: row.id ?? nanoid(10),
          tenantId: row.tenant_id,
          agentId: row.agent_id,
          agentRef: row.agentId ?? dirName,
          type: row.type,
          message: row.message,
          payload: row.payload ? (row.payload as Prisma.InputJsonValue) : Prisma.JsonNull,
          timestamp: new Date(row.timestamp)
        })),
        skipDuplicates: true
      });
      report.agentEvents.imported += result.count;
      report.agentEvents.skipped += rows.length - result.count;
    } catch {
      report.agentEvents.errors += rows.length;
    }
  }
}

async function migrateWorkflows(report: MigrationReport): Promise<void> {
  const prisma = getPrismaClient();
  const filePath = path.join(DATA_ROOT, "workflows.json");
  const parsed = await readJsonFile<{ workflows: Workflow[] }>(filePath);
  const workflows = parsed?.workflows ?? [];
  report.workflows.scanned = workflows.length;

  for (const workflow of workflows) {
    try {
      const existing = await prisma.workflow.findUnique({ where: { id: workflow.id }, select: { id: true } });
      await prisma.workflow.upsert({
        where: { id: workflow.id },
        create: {
          id: workflow.id,
          tenantId: workflow.tenant_id ?? "tenant-default",
          name: workflow.name,
          createdAt: new Date(workflow.createdAt),
          updatedAt: new Date(workflow.updatedAt)
        },
        update: {
          tenantId: workflow.tenant_id ?? "tenant-default",
          name: workflow.name,
          updatedAt: new Date(workflow.updatedAt)
        }
      });

      for (const version of workflow.versions ?? []) {
        await prisma.workflowVersion.upsert({
          where: { workflowId_version: { workflowId: workflow.id, version: version.version } },
          create: {
            id: nanoid(12),
            workflowId: workflow.id,
            version: version.version,
            note: version.note ?? null,
            nodes: version.nodes as unknown as Prisma.InputJsonValue,
            edges: version.edges as unknown as Prisma.InputJsonValue,
            createdAt: new Date(version.createdAt)
          },
          update: {
            note: version.note ?? null,
            nodes: version.nodes as unknown as Prisma.InputJsonValue,
            edges: version.edges as unknown as Prisma.InputJsonValue,
            createdAt: new Date(version.createdAt)
          }
        });
      }

      if (existing) {
        report.workflows.skipped += 1;
      } else {
        report.workflows.imported += 1;
      }
    } catch {
      report.workflows.errors += 1;
    }
  }
}

async function migrateRouterRules(report: MigrationReport): Promise<void> {
  const prisma = getPrismaClient();
  const filePath = path.join(DATA_ROOT, "llm-router", "rules.json");
  const rules = await readJsonFile<RouterRuleSet>(filePath);
  if (!rules) return;
  report.routerRules.scanned = 1;
  try {
    const existing = await prisma.routerRule.findUnique({ where: { id: "active" }, select: { id: true } });
    await prisma.routerRule.upsert({
      where: { id: "active" },
      create: {
        id: "active",
        defaultModel: rules.default_model,
        routes: rules.routes as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(rules.updated_at)
      },
      update: {
        defaultModel: rules.default_model,
        routes: rules.routes as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(rules.updated_at)
      }
    });
    if (existing) report.routerRules.skipped += 1;
    else report.routerRules.imported += 1;
  } catch {
    report.routerRules.errors += 1;
  }
}

async function migrateRouterBudgets(report: MigrationReport): Promise<void> {
  const prisma = getPrismaClient();
  const filePath = path.join(DATA_ROOT, "llm-router", "budgets.json");
  const budgets = await readJsonFile<BudgetCaps>(filePath);
  if (!budgets) return;
  report.routerBudgets.scanned = 1;
  try {
    const existing = await prisma.routerBudget.findUnique({ where: { id: "active" }, select: { id: true } });
    await prisma.routerBudget.upsert({
      where: { id: "active" },
      create: {
        id: "active",
        globalDailyCostCapUsd: budgets.global_daily_cost_cap_usd,
        tenants: budgets.tenants as unknown as Prisma.InputJsonValue,
        agents: budgets.agents as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(budgets.updated_at)
      },
      update: {
        globalDailyCostCapUsd: budgets.global_daily_cost_cap_usd,
        tenants: budgets.tenants as unknown as Prisma.InputJsonValue,
        agents: budgets.agents as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(budgets.updated_at)
      }
    });
    if (existing) report.routerBudgets.skipped += 1;
    else report.routerBudgets.imported += 1;
  } catch {
    report.routerBudgets.errors += 1;
  }
}

async function migrateRouterUsage(report: MigrationReport): Promise<void> {
  const prisma = getPrismaClient();
  const filePath = path.join(DATA_ROOT, "llm-router", "usage.jsonl");
  const rows = await readJsonlFile<RouterUsageRecord>(filePath);
  report.routerUsage.scanned = rows.length;
  if (rows.length === 0) return;
  try {
    const result = await prisma.routerUsage.createMany({
      data: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        model: row.model,
        tokens: row.tokens,
        cost: row.cost,
        latencyMs: row.latency_ms,
        status: row.status,
        createdAt: new Date(row.created_at)
      })),
      skipDuplicates: true
    });
    report.routerUsage.imported += result.count;
    report.routerUsage.skipped += rows.length - result.count;
  } catch {
    report.routerUsage.errors += rows.length;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report: MigrationReport = {
    startedAt: new Date().toISOString(),
    dataRoot: DATA_ROOT,
    agents: emptySection(),
    agentEvents: emptySection(),
    workflows: emptySection(),
    routerRules: emptySection(),
    routerBudgets: emptySection(),
    routerUsage: emptySection()
  };

  try {
    await migrateAgents(report);
    await migrateAgentEvents(report);
    await migrateWorkflows(report);
    await migrateRouterRules(report);
    await migrateRouterBudgets(report);
    await migrateRouterUsage(report);
  } finally {
    report.finishedAt = new Date().toISOString();
    const payload = JSON.stringify(report, null, 2);
    if (args.reportPath) {
      await fs.mkdir(path.dirname(args.reportPath), { recursive: true });
      await fs.writeFile(args.reportPath, payload, "utf8");
    }
    process.stdout.write(`${payload}\n`);
    await getPrismaClient().$disconnect();
  }
}

await main();

