import { Router } from "express";
import { agentHub } from "../agents/agentHub.js";

export const agentRouter = Router();

agentRouter.get("/agents", (_req, res) => {
  res.json({ agents: agentHub.listAgents() });
});

agentRouter.post("/agents", async (req, res) => {
  try {
    const { id, name, workspace, template } = req.body as {
      id?: string;
      tenant_id?: string;
      name?: string;
      workspace?: string;
      template?: "mail-triage" | "git-watcher" | "monthly-bookkeeping";
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const agent = await agentHub.createAgent({ id, tenant_id: req.body.tenant_id, name, workspace, template });
    return res.status(201).json(agent);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

agentRouter.post("/agents/:id/start", async (req, res) => {
  try {
    const agent = await agentHub.startAgent(req.params.id);
    return res.json(agent);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

agentRouter.post("/agents/:id/stop", async (req, res) => {
  try {
    const agent = await agentHub.stopAgent(req.params.id);
    return res.json(agent);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

agentRouter.get("/agents/:id/events", async (req, res) => {
  try {
    const tail = Number(req.query.tail ?? req.query.limit ?? 50);
    const events = await agentHub.getEvents(req.params.id, Number.isNaN(tail) ? 50 : tail);
    return res.json({ events });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

agentRouter.get("/agents/:id/skills", async (req, res) => {
  try {
    const skills = await agentHub.getAgentSkills(req.params.id);
    return res.json({ skills });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

agentRouter.post("/agents/:id/skills/attach", async (req, res) => {
  try {
    const { skillName } = req.body as { skillName?: string };
    if (!skillName) {
      return res.status(400).json({ error: "skillName is required" });
    }

    const skills = await agentHub.attachSkill(req.params.id, { skillName });
    return res.json({ skills });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

agentRouter.post("/agents/:id/message", async (req, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const response = await agentHub.sendMessage(req.params.id, message);
    return res.json(response);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

agentRouter.post("/agents/message", async (req, res) => {
  try {
    const { message, agentId } = req.body as { message?: string; agentId?: string };
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const response = await agentHub.routeMessage(message, agentId);
    return res.json(response);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
