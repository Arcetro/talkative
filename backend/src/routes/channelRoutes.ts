import { nanoid } from "nanoid";
import { Router } from "express";
import { appendCommand } from "../orchestrator/store.js";
import { appendClientMessage, appendInternalAction, listClientMessages } from "../channels/store.js";
import { ensureTenantMatch } from "../tenancy/guard.js";

export const channelRouter = Router();

// External client channel (customers/users of a business) -> orchestrator ingress
channelRouter.post("/channels/client/messages", async (req, res) => {
  try {
    const { tenant_id, agent_id, client_id, text } = req.body as {
      tenant_id?: string;
      agent_id?: string;
      client_id?: string;
      text?: string;
    };

    if (!tenant_id || !agent_id || !client_id || !text) {
      return res.status(400).json({ error: "tenant_id, agent_id, client_id, text are required" });
    }
    const tenant = ensureTenantMatch(req, tenant_id);

    const run_id = `run-${nanoid(10)}`;
    const message = await appendClientMessage({ tenant_id: tenant, agent_id, client_id, text, run_id });

    await appendCommand({
      tenant_id: tenant,
      agent_id,
      run_id,
      type: "start_task",
      payload: {
        channel: "client",
        client_id,
        text
      }
    });

    return res.status(201).json({
      accepted: true,
      channel: "client",
      run_id,
      message
    });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

channelRouter.get("/channels/client/messages", async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const tenant_id = ensureTenantMatch(req, req.query.tenant_id as string | undefined);
  const rows = await listClientMessages({
    tenant_id,
    agent_id: req.query.agent_id as string | undefined,
    limit: Number.isNaN(limit) ? 100 : limit
  });
  return res.json({ messages: rows });
});

// Internal operator channel (Mission Control / admins)
channelRouter.post("/channels/internal/actions", async (req, res) => {
  try {
    const { tenant_id, agent_id, operator_id, action, payload } = req.body as {
      tenant_id?: string;
      agent_id?: string;
      operator_id?: string;
      action?: string;
      payload?: Record<string, unknown>;
    };

    if (!tenant_id || !agent_id || !operator_id || !action) {
      return res.status(400).json({ error: "tenant_id, agent_id, operator_id, action are required" });
    }
    const tenant = ensureTenantMatch(req, tenant_id);

    const row = await appendInternalAction({ tenant_id: tenant, agent_id, operator_id, action, payload });
    return res.status(201).json({ accepted: true, channel: "internal", action: row });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
