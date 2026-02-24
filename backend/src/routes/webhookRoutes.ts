import { Router } from "express";
import { ensureTenantMatch } from "../tenancy/guard.js";
import { createWebhook, disableWebhook, listWebhooks, listInvocations } from "../webhooks/store.js";
import { handleWebhook } from "../webhooks/handler.js";

export const webhookRouter = Router();

/**
 * POST /webhooks/:webhook_id — Public ingress (no auth required beyond secret).
 *
 * Headers:
 *   X-Webhook-Secret: <secret>
 *
 * Body:
 *   { "event_type": "booking.confirmed", "payload": { ... } }
 */
webhookRouter.post("/webhooks/:webhook_id", async (req, res) => {
  try {
    const secret = req.headers["x-webhook-secret"] as string | undefined;
    if (!secret) {
      return res.status(401).json({ error: "X-Webhook-Secret header is required" });
    }

    const { event_type, payload } = req.body as {
      event_type?: string;
      payload?: Record<string, unknown>;
    };

    if (!event_type) {
      return res.status(400).json({ error: "event_type is required" });
    }

    const result = await handleWebhook(req.params.webhook_id, secret, { event_type, payload });

    if (result.status === "rejected") {
      const code = result.reason === "invalid_secret" ? 401 : 422;
      return res.status(code).json(result);
    }

    return res.status(202).json(result);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// --- Admin endpoints (authenticated) ---

webhookRouter.post("/webhook-configs", async (req, res) => {
  try {
    const { tenant_id, agent_id, label, allowed_events } = req.body as {
      tenant_id?: string;
      agent_id?: string;
      label?: string;
      allowed_events?: string[];
    };

    if (!tenant_id || !agent_id || !label) {
      return res.status(400).json({ error: "tenant_id, agent_id, label are required" });
    }

    const tenant = ensureTenantMatch(req, tenant_id);
    const webhook = await createWebhook({ tenant_id: tenant, agent_id, label, allowed_events });
    return res.status(201).json(webhook);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

webhookRouter.get("/webhook-configs", async (req, res) => {
  const tenant_id = ensureTenantMatch(req, req.query.tenant_id as string | undefined);
  const webhooks = await listWebhooks({
    tenant_id,
    agent_id: req.query.agent_id as string | undefined
  });
  return res.json({ webhooks });
});

webhookRouter.post("/webhook-configs/:id/disable", async (req, res) => {
  const webhook = await disableWebhook(req.params.id);
  if (!webhook) return res.status(404).json({ error: "Webhook not found" });
  return res.json(webhook);
});

webhookRouter.get("/webhook-configs/:id/invocations", async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const invocations = await listInvocations({
    webhook_id: req.params.id,
    limit: Number.isNaN(limit) ? 50 : limit
  });
  return res.json({ invocations });
});
