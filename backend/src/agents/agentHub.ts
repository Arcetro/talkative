import { nanoid } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AgentRunner } from "./agentRunner.js";
import { AgentRegistry } from "./agentRegistry.js";
import { appendAgentEvent, readAgentEvents } from "./eventStore.js";
import { SKILL_TEMPLATES_ROOT, WORKSPACE_ROOT } from "./paths.js";
import { AgentMessageResponse, AgentRecord, AgentSkill } from "./types.js";
import { ensureInside, exists } from "./utils.js";

function nowIso(): string {
  return new Date().toISOString();
}

function toWorkspacePath(input: string): string {
  return path.isAbsolute(input) ? input : path.join(WORKSPACE_ROOT, input);
}

export class AgentHub {
  private runners = new Map<string, AgentRunner>();
  private registry = new AgentRegistry();

  async init(): Promise<void> {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    const agents = await this.registry.load();

    for (const agent of agents) {
      const runner = this.buildRunner(agent);
      this.runners.set(agent.id, runner);
      await runner.initialize();
      if (agent.status === "running") {
        await runner.start();
      }
    }
  }

  private buildRunner(agent: AgentRecord): AgentRunner {
    return new AgentRunner(agent, async (nextAgent) => {
      await this.registry.upsert(nextAgent);
    });
  }

  listAgents(): AgentRecord[] {
    return this.registry.list();
  }

  getAgent(id: string): AgentRecord | undefined {
    return this.registry.get(id);
  }

  async createAgent(input: {
    id?: string;
    tenant_id?: string;
    name: string;
    workspace?: string;
    template?: "mail-triage" | "git-watcher" | "monthly-bookkeeping";
  }): Promise<AgentRecord> {
    const id = input.id?.trim() || nanoid(8);
    if (this.getAgent(id)) {
      throw new Error(`Agent ${id} already exists`);
    }

    const workspace = ensureInside(
      WORKSPACE_ROOT,
      input.workspace ? path.relative(WORKSPACE_ROOT, toWorkspacePath(input.workspace)) : id
    );

    const createdAt = nowIso();
    const agent: AgentRecord = {
      id,
      agent_id: id,
      tenant_id: input.tenant_id ?? "tenant-default",
      name: input.name,
      workspace,
      status: "stopped",
      heartbeatMinutes: 30,
      createdAt,
      updatedAt: createdAt
    };

    await this.registry.add(agent);
    const runner = this.buildRunner(agent);
    this.runners.set(id, runner);
    await runner.initialize();

    if (input.template) {
      await this.attachSkill(id, { skillName: input.template });
    }

    await appendAgentEvent({
      agentId: agent.id,
      agent_id: agent.agent_id,
      tenant_id: agent.tenant_id,
      type: "AGENT_CREATED",
      message: `Agent ${agent.name} created`
    });
    return agent;
  }

  private async seedMailTriageWorkspace(workspace: string): Promise<void> {
    await fs.mkdir(path.join(workspace, "inputs"), { recursive: true });
    await fs.mkdir(path.join(workspace, "outputs"), { recursive: true });

    const heartbeatPath = path.join(workspace, "HEARTBEAT.md");
    await fs.writeFile(
      heartbeatPath,
      [
        "# Heartbeat Tasks",
        "",
        "RUN node skills/mail-triage/scripts/triageEmails.ts --input inputs/emails.sample.json --output outputs/triage-result.json"
      ].join("\n"),
      "utf8"
    );

    const sampleEmails = [
      { from: "supplier@farm.com", subject: "Invoice #204", body: "Please pay pending vegetables invoice this week." },
      { from: "boss@shop.com", subject: "Schedule update", body: "Open 30 minutes earlier tomorrow." },
      { from: "friend@mail.com", subject: "Birthday dinner", body: "Are you joining us tonight?" },
      { from: "promo@shady.biz", subject: "You won $99999", body: "Click this suspicious link now." }
    ];

    await fs.writeFile(path.join(workspace, "inputs", "emails.sample.json"), JSON.stringify(sampleEmails, null, 2), "utf8");
  }

  private async seedGitWatcherWorkspace(workspace: string): Promise<void> {
    await fs.mkdir(path.join(workspace, "outputs"), { recursive: true });
    const heartbeatPath = path.join(workspace, "HEARTBEAT.md");
    await fs.writeFile(
      heartbeatPath,
      ["# Heartbeat Tasks", "", "RUN node skills/git-watcher/scripts/gitStatusReport.ts --repo . --output outputs/git-status.json"].join(
        "\n"
      ),
      "utf8"
    );
  }

  private async seedMonthlyBookkeepingWorkspace(workspace: string): Promise<void> {
    await fs.mkdir(path.join(workspace, "inputs"), { recursive: true });
    await fs.mkdir(path.join(workspace, "outputs"), { recursive: true });

    const csv = [
      "date,description,category,amount",
      "2026-02-01,Daily sales,sales,400",
      "2026-02-02,Vegetable supplier,supplies,-120",
      "2026-02-03,Transport,logistics,-40",
      "2026-02-05,Daily sales,sales,360"
    ].join("\n");
    await fs.writeFile(path.join(workspace, "inputs", "transactions.sample.csv"), csv, "utf8");

    const heartbeatPath = path.join(workspace, "HEARTBEAT.md");
    await fs.writeFile(
      heartbeatPath,
      [
        "# Heartbeat Tasks",
        "",
        "RUN node skills/monthly-bookkeeping/scripts/summarizeTransactions.ts --input inputs/transactions.sample.csv --output outputs/bookkeeping-report.json"
      ].join("\n"),
      "utf8"
    );
  }

  async startAgent(id: string): Promise<AgentRecord> {
    const runner = this.runners.get(id);
    if (!runner) throw new Error("Agent not found");
    await runner.start();
    return runner.getAgent();
  }

  async stopAgent(id: string): Promise<AgentRecord> {
    const runner = this.runners.get(id);
    if (!runner) throw new Error("Agent not found");
    await runner.stop();
    return runner.getAgent();
  }

  async getAgentSkills(id: string): Promise<AgentSkill[]> {
    const runner = this.runners.get(id);
    if (!runner) throw new Error("Agent not found");
    return runner.refreshSkills();
  }

  async attachSkill(id: string, input: { skillName: string }): Promise<AgentSkill[]> {
    const runner = this.runners.get(id);
    if (!runner) throw new Error("Agent not found");

    const agent = runner.getAgent();
    const templatePath = path.join(SKILL_TEMPLATES_ROOT, input.skillName);
    if (!(await exists(templatePath))) {
      throw new Error(`Skill template not found: ${input.skillName}`);
    }

    const skillsDir = path.join(agent.workspace, "skills");
    await fs.mkdir(skillsDir, { recursive: true });

    const target = path.join(skillsDir, input.skillName);
    await fs.mkdir(target, { recursive: true });
    await fs.cp(templatePath, target, { recursive: true, force: true });

    if (input.skillName === "mail-triage") {
      await this.seedMailTriageWorkspace(agent.workspace);
    }
    if (input.skillName === "git-watcher") {
      await this.seedGitWatcherWorkspace(agent.workspace);
    }
    if (input.skillName === "monthly-bookkeeping") {
      await this.seedMonthlyBookkeepingWorkspace(agent.workspace);
    }

    await appendAgentEvent({
      agentId: id,
      agent_id: agent.agent_id,
      tenant_id: agent.tenant_id,
      type: "SKILL_ATTACHED",
      message: `Skill attached: ${input.skillName}`
    });

    return runner.refreshSkills();
  }

  async getEvents(id: string, limit = 50) {
    return readAgentEvents(id, limit);
  }

  async sendMessage(id: string, message: string): Promise<AgentMessageResponse> {
    const runner = this.runners.get(id);
    if (!runner) throw new Error("Agent not found");

    if (runner.getAgent().status !== "running") {
      throw new Error("Agent is stopped. Start it before sending messages.");
    }

    return runner.handleMessage(message);
  }

  classifyAgent(message: string): AgentRecord | null {
    const lower = message.toLowerCase();

    if (lower.includes("mail") || lower.includes("email") || lower.includes("inbox")) {
      return this.registry.list().find((agent) => agent.name.toLowerCase().includes("mail")) ?? this.registry.list()[0] ?? null;
    }

    if (lower.includes("git") || lower.includes("repo")) {
      return this.registry.list().find((agent) => agent.name.toLowerCase().includes("git")) ?? this.registry.list()[0] ?? null;
    }

    return this.registry.list()[0] ?? null;
  }

  async routeMessage(message: string, preferredAgentId?: string): Promise<{ agentId: string; response: AgentMessageResponse }> {
    const preferred = preferredAgentId ? this.getAgent(preferredAgentId) ?? null : null;
    const selected = preferred ?? this.classifyAgent(message);
    if (!selected) {
      throw new Error("No agents available to route this message");
    }

    const response = await this.sendMessage(selected.id, message);
    return { agentId: selected.id, response };
  }
}

export const agentHub = new AgentHub();
