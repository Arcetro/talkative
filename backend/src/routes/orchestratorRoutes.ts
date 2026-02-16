import { Router } from "express";
import { appendCommand, appendEvent, getRun, listRuns } from "../orchestrator/store.js";

export const orchestratorRouter = Router();

orchestratorRouter.get("/orchestrator/contracts", (_req, res) => {
  res.json({
    commands: ["start_task", "pause", "resume", "cancel", "request_delegate"],
    events: ["state_changed", "tool_started", "tool_finished", "metric_recorded", "error_compacted"],
    run_status: ["pending", "running", "paused", "cancelled", "failed", "completed"],
    subagent_state: ["idle", "running", "paused", "stopped", "error"]
  });
});

orchestratorRouter.post("/orchestrator/commands", async (req, res) => {
  try {
    const { tenant_id, agent_id, run_id, type, payload } = req.body as {
      tenant_id?: string;
      agent_id?: string;
      run_id?: string;
      type?: string;
      payload?: Record<string, unknown>;
    };

    if (!tenant_id || !agent_id || !run_id || !type) {
      return res.status(400).json({ error: "tenant_id, agent_id, run_id and type are required" });
    }

    const allowed = ["start_task", "pause", "resume", "cancel", "request_delegate"];
    if (!allowed.includes(type)) {
      return res.status(400).json({ error: `Invalid command type: ${type}` });
    }

    const row = await appendCommand({
      tenant_id,
      agent_id,
      run_id,
      type: type as any,
      payload
    });

    return res.status(201).json(row);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

orchestratorRouter.post("/orchestrator/events", async (req, res) => {
  try {
    const { tenant_id, agent_id, run_id, type, message, payload } = req.body as {
      tenant_id?: string;
      agent_id?: string;
      run_id?: string;
      type?: string;
      message?: string;
      payload?: Record<string, unknown>;
    };

    if (!tenant_id || !agent_id || !run_id || !type || !message) {
      return res.status(400).json({ error: "tenant_id, agent_id, run_id, type, message are required" });
    }

    const allowed = ["state_changed", "tool_started", "tool_finished", "metric_recorded", "error_compacted"];
    if (!allowed.includes(type)) {
      return res.status(400).json({ error: `Invalid event type: ${type}` });
    }

    const row = await appendEvent({
      tenant_id,
      agent_id,
      run_id,
      type: type as any,
      message,
      payload
    });

    return res.status(201).json(row);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

orchestratorRouter.get("/orchestrator/runs/:run_id", async (req, res) => {
  const run = await getRun(req.params.run_id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  return res.json(run);
});

async function controlRun(run_id: string, type: "pause" | "resume" | "cancel") {
  const run = await getRun(run_id);
  if (!run) {
    throw new Error("Run not found");
  }
  return appendCommand({
    tenant_id: run.tenant_id,
    agent_id: run.agent_id,
    run_id: run.run_id,
    type,
    payload: { source: "run-control-api" }
  });
}

orchestratorRouter.post("/orchestrator/runs/:run_id/pause", async (req, res) => {
  try {
    const row = await controlRun(req.params.run_id, "pause");
    return res.json({ ok: true, command: row });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

orchestratorRouter.post("/orchestrator/runs/:run_id/resume", async (req, res) => {
  try {
    const row = await controlRun(req.params.run_id, "resume");
    return res.json({ ok: true, command: row });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

orchestratorRouter.post("/orchestrator/runs/:run_id/cancel", async (req, res) => {
  try {
    const row = await controlRun(req.params.run_id, "cancel");
    return res.json({ ok: true, command: row });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

orchestratorRouter.get("/orchestrator/runs", async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const runs = await listRuns({
    tenant_id: req.query.tenant_id as string | undefined,
    agent_id: req.query.agent_id as string | undefined,
    limit: Number.isNaN(limit) ? 100 : limit
  });
  return res.json({ runs });
});
