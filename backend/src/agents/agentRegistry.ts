import { promises as fs } from "node:fs";
import path from "node:path";
import { getPrismaClient } from "../persistence/prisma.js";
import { isDatabasePersistenceEnabled } from "../persistence/config.js";
import { AGENTS_REGISTRY_FILE } from "./paths.js";
import { AgentRecord } from "./types.js";
import { exists } from "./utils.js";

interface AgentsRegistryData {
  agents: AgentRecord[];
}

export class AgentRegistry {
  private data: AgentsRegistryData = { agents: [] };

  async load(): Promise<AgentRecord[]> {
    if (isDatabasePersistenceEnabled()) {
      const prisma = getPrismaClient();
      const agents = await prisma.agent.findMany({ orderBy: { createdAt: "asc" } });
      this.data.agents = agents.map((row) => ({
        id: row.id,
        agent_id: row.agentId,
        tenant_id: row.tenantId,
        name: row.name,
        workspace: row.workspace,
        status: row.status as AgentRecord["status"],
        heartbeatMinutes: row.heartbeatMinutes,
        lastHeartbeatAt: row.lastHeartbeatAt?.toISOString(),
        lastMessageAt: row.lastMessageAt?.toISOString(),
        lastMessage: row.lastMessage ?? undefined,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      }));
      return this.data.agents;
    }

    await fs.mkdir(path.dirname(AGENTS_REGISTRY_FILE), { recursive: true });
    if (!(await exists(AGENTS_REGISTRY_FILE))) {
      await fs.writeFile(AGENTS_REGISTRY_FILE, JSON.stringify({ agents: [] }, null, 2), "utf8");
    }

    const raw = await fs.readFile(AGENTS_REGISTRY_FILE, "utf8");
    this.data = JSON.parse(raw) as AgentsRegistryData;
    this.data.agents = this.data.agents.map((agent) => ({
      ...agent,
      agent_id: agent.agent_id ?? agent.id,
      tenant_id: agent.tenant_id ?? "tenant-default"
    }));
    await this.save();
    return this.data.agents;
  }

  list(): AgentRecord[] {
    return this.data.agents;
  }

  get(id: string): AgentRecord | undefined {
    return this.data.agents.find((agent) => agent.id === id);
  }

  async add(agent: AgentRecord): Promise<void> {
    this.data.agents.push(agent);
    await this.save();
  }

  async upsert(agent: AgentRecord): Promise<void> {
    const idx = this.data.agents.findIndex((item) => item.id === agent.id);
    if (idx >= 0) {
      this.data.agents[idx] = { ...agent };
    } else {
      this.data.agents.push(agent);
    }
    await this.save();
  }

  async save(): Promise<void> {
    if (isDatabasePersistenceEnabled()) {
      const prisma = getPrismaClient();
      await Promise.all(
        this.data.agents.map((agent) =>
          prisma.agent.upsert({
            where: { id: agent.id },
            create: {
              id: agent.id,
              agentId: agent.agent_id,
              tenantId: agent.tenant_id,
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
              agentId: agent.agent_id,
              tenantId: agent.tenant_id,
              name: agent.name,
              workspace: agent.workspace,
              status: agent.status,
              heartbeatMinutes: agent.heartbeatMinutes,
              lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
              lastMessageAt: agent.lastMessageAt ? new Date(agent.lastMessageAt) : null,
              lastMessage: agent.lastMessage ?? null,
              updatedAt: new Date(agent.updatedAt)
            }
          })
        )
      );
      return;
    }

    await fs.writeFile(AGENTS_REGISTRY_FILE, JSON.stringify(this.data, null, 2), "utf8");
  }
}
