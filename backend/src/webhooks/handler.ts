import { nanoid } from "nanoid";
import { appendCommand } from "../orchestrator/store.js";
import { publishEvent } from "../services/eventBus.js";
import { getWebhook, logInvocation } from "./store.js";

export interface WebhookPayload {
  event_type: string;
  payload?: Record<string, unknown>;
}

export interface HandleResult {
  status: "accepted" | "rejected";
  reason?: string;
  run_id?: string;
  invocation_id: string;
}

/**
 * Process an incoming webhook invocation.
 *
 * 1. Validate webhook exists and is enabled
 * 2. Validate secret matches
 * 3. Validate event_type is allowed
 * 4. Create orchestrator command (start_task)
 * 5. Log invocation
 * 6. Publish domain event
 */
export async function handleWebhook(
  webhookId: string,
  secret: string,
  body: WebhookPayload
): Promise<HandleResult> {
  const webhook = await getWebhook(webhookId);

  // Webhook not found
  if (!webhook) {
    const inv = await logInvocation({
      webhook_id: webhookId,
      tenant_id: "unknown",
      agent_id: "unknown",
      event_type: body.event_type ?? "unknown",
      payload: body.payload ?? {},
      status: "rejected",
      rejection_reason: "webhook_not_found"
    });
    return { status: "rejected", reason: "webhook_not_found", invocation_id: inv.id };
  }

  // Webhook disabled
  if (!webhook.enabled) {
    const inv = await logInvocation({
      webhook_id: webhookId,
      tenant_id: webhook.tenant_id,
      agent_id: webhook.agent_id,
      event_type: body.event_type,
      payload: body.payload ?? {},
      status: "rejected",
      rejection_reason: "webhook_disabled"
    });
    return { status: "rejected", reason: "webhook_disabled", invocation_id: inv.id };
  }

  // Secret mismatch
  if (webhook.secret !== secret) {
    const inv = await logInvocation({
      webhook_id: webhookId,
      tenant_id: webhook.tenant_id,
      agent_id: webhook.agent_id,
      event_type: body.event_type,
      payload: body.payload ?? {},
      status: "rejected",
      rejection_reason: "invalid_secret"
    });
    return { status: "rejected", reason: "invalid_secret", invocation_id: inv.id };
  }

  // Event type not allowed
  if (webhook.allowed_events.length > 0 && !webhook.allowed_events.includes(body.event_type)) {
    const inv = await logInvocation({
      webhook_id: webhookId,
      tenant_id: webhook.tenant_id,
      agent_id: webhook.agent_id,
      event_type: body.event_type,
      payload: body.payload ?? {},
      status: "rejected",
      rejection_reason: "event_type_not_allowed"
    });
    return { status: "rejected", reason: "event_type_not_allowed", invocation_id: inv.id };
  }

  // All good — create orchestrator command and log
  const run_id = `wh-${nanoid(10)}`;

  await appendCommand({
    tenant_id: webhook.tenant_id,
    agent_id: webhook.agent_id,
    run_id,
    type: "start_task",
    payload: {
      source: "webhook",
      webhook_id: webhookId,
      event_type: body.event_type,
      ...(body.payload ?? {})
    }
  });

  const inv = await logInvocation({
    webhook_id: webhookId,
    tenant_id: webhook.tenant_id,
    agent_id: webhook.agent_id,
    event_type: body.event_type,
    payload: body.payload ?? {},
    status: "accepted",
    run_id
  });

  publishEvent({
    type: "workflow.updated",
    timestamp: new Date().toISOString(),
    payload: {
      channel: "webhook",
      tenant_id: webhook.tenant_id,
      agent_id: webhook.agent_id,
      webhook_id: webhookId,
      event_type: body.event_type,
      run_id
    }
  });

  return { status: "accepted", run_id, invocation_id: inv.id };
}
