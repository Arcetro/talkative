import { Router } from "express";
import { activatePromptVersion, createPromptVersion, listPrompts } from "../prompt/store.js";
import { ensureTenantMatch } from "../tenancy/guard.js";

export const promptRouter = Router();

promptRouter.get("/prompts", async (req, res) => {
  const tenant_id = ensureTenantMatch(req, req.query.tenant_id as string | undefined);
  const prompts = await listPrompts({
    tenant_id,
    agent_id: req.query.agent_id as string | undefined
  });
  res.json({ prompts });
});

promptRouter.post("/prompts", async (req, res) => {
  try {
    const { tenant_id, agent_id, template, activate } = req.body as {
      tenant_id?: string;
      agent_id?: string;
      template?: string;
      activate?: boolean;
    };
    if (!tenant_id || !agent_id || !template) {
      return res.status(400).json({ error: "tenant_id, agent_id, template are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    const created = await createPromptVersion({ tenant_id: tenant, agent_id, template, activate });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

promptRouter.post("/prompts/activate", async (req, res) => {
  try {
    const { tenant_id, agent_id, version } = req.body as { tenant_id?: string; agent_id?: string; version?: number };
    if (!tenant_id || !agent_id || typeof version !== "number") {
      return res.status(400).json({ error: "tenant_id, agent_id, version are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    const active = await activatePromptVersion({ tenant_id: tenant, agent_id, version });
    return res.json(active);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
