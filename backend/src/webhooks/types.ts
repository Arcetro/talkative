export interface WebhookConfig {
  id: string;
  tenant_id: string;
  agent_id: string;
  /** Secret used to validate incoming requests via X-Webhook-Secret header */
  secret: string;
  /** Human label for this webhook */
  label: string;
  /** Only accept these event types. Empty array = accept all. */
  allowed_events: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookInvocation {
  id: string;
  webhook_id: string;
  tenant_id: string;
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: "accepted" | "rejected" | "failed";
  rejection_reason?: string;
  run_id?: string;
  created_at: string;
}
