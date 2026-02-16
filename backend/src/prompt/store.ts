import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { BACKEND_ROOT } from "../agents/paths.js";
import { PromptVersion } from "./types.js";

const PROMPT_DIR = path.join(BACKEND_ROOT, "data", "prompts");
const PROMPT_FILE = path.join(PROMPT_DIR, "registry.json");

async function ensure(): Promise<void> {
  await fs.mkdir(PROMPT_DIR, { recursive: true });
  try {
    await fs.access(PROMPT_FILE);
  } catch {
    await fs.writeFile(PROMPT_FILE, JSON.stringify({ prompts: [] }, null, 2), "utf8");
  }
}

async function readPrompts(): Promise<PromptVersion[]> {
  await ensure();
  const raw = await fs.readFile(PROMPT_FILE, "utf8");
  return (JSON.parse(raw) as { prompts: PromptVersion[] }).prompts;
}

async function writePrompts(prompts: PromptVersion[]): Promise<void> {
  await fs.writeFile(PROMPT_FILE, JSON.stringify({ prompts }, null, 2), "utf8");
}

export async function listPrompts(filter: { tenant_id?: string; agent_id?: string }): Promise<PromptVersion[]> {
  const prompts = await readPrompts();
  return prompts
    .filter((p) => (filter.tenant_id ? p.tenant_id === filter.tenant_id : true))
    .filter((p) => (filter.agent_id ? p.agent_id === filter.agent_id : true))
    .sort((a, b) => a.version - b.version);
}

export async function createPromptVersion(input: {
  tenant_id: string;
  agent_id: string;
  template: string;
  activate?: boolean;
}): Promise<PromptVersion> {
  const prompts = await readPrompts();
  const scoped = prompts.filter((p) => p.tenant_id === input.tenant_id && p.agent_id === input.agent_id);
  const nextVersion = (scoped.at(-1)?.version ?? 0) + 1;

  if (input.activate) {
    prompts.forEach((p) => {
      if (p.tenant_id === input.tenant_id && p.agent_id === input.agent_id) p.is_active = false;
    });
  }

  const created: PromptVersion = {
    id: nanoid(10),
    tenant_id: input.tenant_id,
    agent_id: input.agent_id,
    version: nextVersion,
    template: input.template,
    is_active: Boolean(input.activate) || scoped.length === 0,
    created_at: new Date().toISOString()
  };

  prompts.push(created);
  await writePrompts(prompts);
  return created;
}

export async function activatePromptVersion(input: { tenant_id: string; agent_id: string; version: number }): Promise<PromptVersion> {
  const prompts = await readPrompts();
  let active: PromptVersion | null = null;

  prompts.forEach((p) => {
    if (p.tenant_id === input.tenant_id && p.agent_id === input.agent_id) {
      p.is_active = p.version === input.version;
      if (p.is_active) active = p;
    }
  });

  if (!active) {
    throw new Error(`Prompt version ${input.version} not found for tenant/agent`);
  }

  await writePrompts(prompts);
  return active;
}

export async function getActivePrompt(tenant_id: string, agent_id: string): Promise<PromptVersion | null> {
  const prompts = await readPrompts();
  const found = prompts.find((p) => p.tenant_id === tenant_id && p.agent_id === agent_id && p.is_active);
  return found ?? null;
}
