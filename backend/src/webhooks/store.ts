import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "../agents/paths.js";
import { WebhookConfig, WebhookInvocation } from "./types.js";

const WEBHOOK_DIR = path.join(DATA_ROOT, "webhooks");
const CONFIG_FILE = path.join(WEBHOOK_DIR, "configs.json");
const LOG_FILE = path.join(WEBHOOK_DIR, "invocations.jsonl");

async function ensure(): Promise<void> {
  await fs.mkdir(WEBHOOK_DIR, { recursive: true });
  try {
    await fs.access(CONFIG_FILE);
  } catch {
    await fs.writeFile(CONFIG_FILE, JSON.stringify({ webhooks: [] }, null, 2), "utf8");
  }
  try {
    await fs.access(LOG_FILE);
  } catch {
    await fs.writeFile(LOG_FILE, "", "utf8");
  }
}

async function readConfigs(): Promise<WebhookConfig[]> {
  await ensure();
  const raw = await fs.readFile(CONFIG_FILE, "utf8");
  return (JSON.parse(raw) as { webhooks: WebhookConfig[] }).webhooks;
}

async function writeConfigs(webhooks: WebhookConfig[]): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify({ webhooks }, null, 2), "utf8");
}

export async function createWebhook(input: {
  tenant_id: string;
  agent_id: string;
  label: string;
  allowed_events?: string[];
}): Promise<WebhookConfig> {
  const configs = await readConfigs();
  const now = new Date().toISOString();
  const webhook: WebhookConfig = {
    id: nanoid(16),
    tenant_id: input.tenant_id,
    agent_id: input.agent_id,
    secret: nanoid(32),
    label: input.label,
    allowed_events: input.allowed_events ?? [],
    enabled: true,
    created_at: now,
    updated_at: now
  };
  configs.push(webhook);
  await writeConfigs(configs);
  return webhook;
}

export async function getWebhook(id: string): Promise<WebhookConfig | null> {
  const configs = await readConfigs();
  return configs.find((w) => w.id === id) ?? null;
}

export async function listWebhooks(filter: { tenant_id?: string; agent_id?: string }): Promise<WebhookConfig[]> {
  const configs = await readConfigs();
  return configs
    .filter((w) => (filter.tenant_id ? w.tenant_id === filter.tenant_id : true))
    .filter((w) => (filter.agent_id ? w.agent_id === filter.agent_id : true));
}

export async function disableWebhook(id: string): Promise<WebhookConfig | null> {
  const configs = await readConfigs();
  const webhook = configs.find((w) => w.id === id);
  if (!webhook) return null;
  webhook.enabled = false;
  webhook.updated_at = new Date().toISOString();
  await writeConfigs(configs);
  return webhook;
}

export async function logInvocation(input: Omit<WebhookInvocation, "id" | "created_at">): Promise<WebhookInvocation> {
  await ensure();
  const row: WebhookInvocation = {
    id: nanoid(12),
    created_at: new Date().toISOString(),
    ...input
  };
  await fs.appendFile(LOG_FILE, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

export async function listInvocations(filter: {
  webhook_id?: string;
  limit?: number;
}): Promise<WebhookInvocation[]> {
  await ensure();
  const raw = await fs.readFile(LOG_FILE, "utf8");
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as WebhookInvocation)
    .filter((row) => (filter.webhook_id ? row.webhook_id === filter.webhook_id : true));
  return rows.slice(-(filter.limit ?? 100));
}
