import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { mirrorAgentEvent } from "../orchestrator/service.js";
import { interpretConversation } from "../services/interpreter.js";
import { logRouterUsage } from "../router/service.js";
import { createPatchFromInterpretation } from "./workflowPatch.js";
import { appendAgentEvent } from "./eventStore.js";
import { loadAgentSkills } from "./skillLoader.js";
import { runWorkspaceTool } from "./toolRunner.js";
import { AgentEvent, AgentMessageResponse, AgentRecord, AgentSkill } from "./types.js";
import { ensureInside, exists } from "./utils.js";

interface AgentConfig {
  heartbeatMinutes?: number;
}

export class AgentRunner {
  private timer?: NodeJS.Timeout;
  private skills: AgentSkill[] = [];

  constructor(
    private agent: AgentRecord,
    private onAgentUpdate: (next: AgentRecord) => Promise<void>
  ) {}

  getAgent(): AgentRecord {
    return this.agent;
  }

  getSkills(): AgentSkill[] {
    return this.skills;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.agent.workspace, { recursive: true });
    await fs.mkdir(path.join(this.agent.workspace, "skills"), { recursive: true });
    await fs.mkdir(path.join(this.agent.workspace, "inputs"), { recursive: true });
    await fs.mkdir(path.join(this.agent.workspace, "outputs"), { recursive: true });

    const configPath = path.join(this.agent.workspace, "config.json");
    if (!(await exists(configPath))) {
      const config: AgentConfig = { heartbeatMinutes: this.agent.heartbeatMinutes };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    }

    const heartbeatPath = path.join(this.agent.workspace, "HEARTBEAT.md");
    if (!(await exists(heartbeatPath))) {
      await fs.writeFile(
        heartbeatPath,
        [
          "# Heartbeat Tasks",
          "",
          "Use one command per line with prefix RUN.",
          "Example:",
          "RUN node skills/mail-triage/scripts/triageEmails.ts --input inputs/emails.sample.json --output outputs/triage-result.json"
        ].join("\n"),
        "utf8"
      );
    }

    this.skills = await loadAgentSkills(this.agent.workspace);
  }

  async refreshSkills(): Promise<AgentSkill[]> {
    this.skills = await loadAgentSkills(this.agent.workspace);
    return this.skills;
  }

  private async emit(type: AgentEvent["type"], message: string, payload?: Record<string, unknown>): Promise<AgentEvent> {
    const saved = await appendAgentEvent({
      agentId: this.agent.id,
      agent_id: this.agent.agent_id,
      tenant_id: this.agent.tenant_id,
      type,
      message,
      payload
    });
    const run_id = typeof payload?.run_id === "string" ? payload.run_id : `session-${this.agent.agent_id}`;
    await mirrorAgentEvent({
      tenant_id: this.agent.tenant_id,
      agent_id: this.agent.agent_id,
      run_id,
      event_type: type,
      message,
      payload
    });
    return saved;
  }

  private async applyConfig(): Promise<void> {
    const configPath = path.join(this.agent.workspace, "config.json");
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as AgentConfig;
      if (parsed.heartbeatMinutes && parsed.heartbeatMinutes > 0) {
        this.agent.heartbeatMinutes = parsed.heartbeatMinutes;
      }
    } catch {
      // Keep current config if file is missing or malformed.
    }
  }

  private scheduleHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    const intervalMs = this.agent.heartbeatMinutes * 60_000;
    this.timer = setInterval(() => {
      void this.runHeartbeat("scheduled");
    }, intervalMs);
  }

  async start(): Promise<void> {
    await this.initialize();
    await this.applyConfig();
    this.scheduleHeartbeat();

    this.agent.status = "running";
    this.agent.updatedAt = new Date().toISOString();
    await this.onAgentUpdate(this.agent);
    await this.emit("AGENT_STARTED", `Agent ${this.agent.name} started`, {
      heartbeatMinutes: this.agent.heartbeatMinutes
    });
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.agent.status = "stopped";
    this.agent.updatedAt = new Date().toISOString();
    await this.onAgentUpdate(this.agent);
    await this.emit("AGENT_STOPPED", `Agent ${this.agent.name} stopped`);
  }

  async runHeartbeat(reason: "scheduled" | "manual"): Promise<AgentEvent[]> {
    const emitted: AgentEvent[] = [];
    const heartbeatPath = path.join(this.agent.workspace, "HEARTBEAT.md");
    let content = "";

    try {
      content = await fs.readFile(heartbeatPath, "utf8");
    } catch {
      emitted.push(await this.emit("HEARTBEAT_TICK", "Heartbeat skipped: HEARTBEAT.md missing", { reason }));
      return emitted;
    }

    const commands = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("RUN "))
      .map((line) => line.slice(4));

    this.agent.lastHeartbeatAt = new Date().toISOString();
    this.agent.updatedAt = new Date().toISOString();
    await this.onAgentUpdate(this.agent);

    emitted.push(
      await this.emit("HEARTBEAT_TICK", `Heartbeat triggered (${reason})`, {
        commandCount: commands.length
      })
    );

    for (const command of commands) {
      try {
        emitted.push(await this.emit("TOOL_RUN_STARTED", `Tool run started: ${command}`));
        const result = await runWorkspaceTool(this.agent.workspace, command);
        if (!result.ok) {
          emitted.push(
            await this.emit("TOOL_RUN_FINISHED", `Tool failed: ${command}`, {
              stderr: result.stderr,
              exitCode: result.exitCode,
              ok: false
            })
          );
        } else {
          emitted.push(
            await this.emit("TOOL_RUN_FINISHED", `Tool executed: ${command}`, {
              stdout: result.stdout,
              exitCode: result.exitCode,
              ok: true
            })
          );
          emitted.push(await this.emit("METRIC_RECORDED", "Tool metric recorded", { command, runMs: 0 }));
        }
      } catch (error) {
        emitted.push(
          await this.emit("TOOL_RUN_FINISHED", `Tool rejected: ${command}`, {
            error: (error as Error).message
          })
        );
      }
    }

    return emitted;
  }

  async handleMessage(message: string): Promise<AgentMessageResponse> {
    const startedAt = Date.now();
    const run_id = `run-${nanoid(8)}`;
    const events: AgentEvent[] = [];
    const now = new Date().toISOString();
    this.agent.lastMessageAt = now;
    this.agent.lastMessage = message;
    this.agent.updatedAt = now;
    await this.onAgentUpdate(this.agent);

    events.push(await this.emit("MESSAGE_RECEIVED", message, { run_id }));

    const interpretation = interpretConversation(message);
    events.push(
      await this.emit("INTERPRETATION_RESULT", "Interpretation generated", {
        run_id,
        detectedTasks: interpretation.detectedTasks
      })
    );
    const workflowPatch = createPatchFromInterpretation(interpretation, 0);
    events.push(
      await this.emit("WORKFLOW_PATCH_PROPOSED", "Workflow patch proposed from conversation", {
        run_id,
        patchId: workflowPatch.id,
        operations: workflowPatch.operations.length
      })
    );
    const actions: AgentMessageResponse["actions"] = [];
    let reply = `Agent ${this.agent.name} interpreted ${interpretation.detectedTasks.length} task(s).`;

    const lower = message.toLowerCase();
    if (lower.includes("heartbeat") && (lower.includes("run") || lower.includes("now"))) {
      const heartbeatEvents = await this.runHeartbeat("manual");
      events.push(...heartbeatEvents);
      actions.push({ type: "heartbeat.executed", data: { count: heartbeatEvents.length } });
      reply += " Heartbeat executed.";
    }

    const hasMailSkill = this.skills.some((skill) => skill.id === "mail-triage");
    if (hasMailSkill && (lower.includes("triage") || lower.includes("email"))) {
      const command =
        "node skills/mail-triage/scripts/triageEmails.ts --input inputs/emails.sample.json --output outputs/triage-result.json";
      try {
        events.push(await this.emit("TOOL_RUN_STARTED", "Mail triage tool started", { run_id, command }));
        const result = await runWorkspaceTool(this.agent.workspace, command);
        if (result.ok) {
          actions.push({ type: "tool.executed", data: { command, output: "outputs/triage-result.json" } });
          events.push(await this.emit("TOOL_RUN_FINISHED", "Mail triage skill executed", { run_id, command, ok: true }));
          events.push(await this.emit("METRIC_RECORDED", "Mail triage metric recorded", { run_id, command, runMs: 0 }));
          reply += " Mail triage completed and wrote outputs/triage-result.json.";
        } else {
          actions.push({ type: "tool.failed", data: { command } });
          events.push(
            await this.emit("TOOL_RUN_FINISHED", "Mail triage skill failed", { run_id, stderr: result.stderr, ok: false })
          );
          reply += " Mail triage failed.";
        }
      } catch (error) {
        actions.push({ type: "tool.failed", data: { command } });
        events.push(
          await this.emit("TOOL_RUN_FINISHED", "Mail triage rejected", {
            run_id,
            error: (error as Error).message,
            ok: false
          })
        );
        reply += " Mail triage command rejected by safety rules.";
      }
    }

    events.push(
      await this.emit("WORKFLOW_PATCH_APPLIED", "Workflow patch accepted in session", {
        run_id,
        patchId: workflowPatch.id
      })
    );

    const response: AgentMessageResponse = {
      agentId: this.agent.id,
      reply,
      interpretation,
      workflowPatch,
      actions,
      events
    };
    await logRouterUsage({
      tenant_id: this.agent.tenant_id,
      agent_id: this.agent.agent_id,
      prompt: message,
      latency_ms: Date.now() - startedAt,
      status: "ok"
    });
    return response;
  }

  async runCommand(command: string): Promise<void> {
    ensureInside(this.agent.workspace, ".");
    await runWorkspaceTool(this.agent.workspace, command);
  }
}
