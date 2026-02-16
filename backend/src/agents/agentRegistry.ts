import { promises as fs } from "node:fs";
import path from "node:path";
import { AGENTS_REGISTRY_FILE } from "./paths.js";
import { AgentRecord } from "./types.js";
import { exists } from "./utils.js";

interface AgentsRegistryData {
  agents: AgentRecord[];
}

export class AgentRegistry {
  private data: AgentsRegistryData = { agents: [] };

  async load(): Promise<AgentRecord[]> {
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
    await fs.writeFile(AGENTS_REGISTRY_FILE, JSON.stringify(this.data, null, 2), "utf8");
  }
}
