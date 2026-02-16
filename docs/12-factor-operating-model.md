# 12-Factor Agents Audit + System Roles

This document maps the 12-factor-agent principles to current Talkative state and assigns a clear owner role.

## Roles

- Product Owner: validates user value, safety policy, and rollout criteria.
- Agent Platform Engineer (Backend): agent runtime, router, tools, run-state.
- Frontend Engineer: Mission Control and Router Admin operator UX.
- Infrastructure/DevOps: deploy, CI/CD, observability, runtime reliability.
- Security Engineer: tenant isolation, secret handling, authz/authn hardening.

## Principle Checklist

1. Natural language -> tool calls
- Status: PARTIAL
- Owner: Agent Platform Engineer
- Next: enforce one tool-result schema for all tools.

2. Own your prompts
- Status: GAP
- Owner: Agent Platform Engineer
- Next: prompt registry per tenant_id + agent_id with versioning.

3. Own your context window
- Status: GAP
- Owner: Agent Platform Engineer
- Next: deterministic context-builder with token limits and compaction.

4. Tools as structured outputs
- Status: PARTIAL
- Owner: Agent Platform Engineer
- Next: standardize `{ok,error,artifacts,metrics}` output contract.

5. Unify execution state + business state
- Status: PARTIAL
- Owner: Agent Platform Engineer
- Next: add run model (`run_id`, steps, lifecycle).

6. Launch/Pause/Resume APIs
- Status: PARTIAL
- Owner: Agent Platform Engineer
- Next: pause/resume/cancel with checkpoints.

7. Contact humans with tool calls
- Status: GAP
- Owner: Frontend Engineer + Agent Platform Engineer
- Next: `request_human_approval` flow in Mission Control.

8. Own your control flow
- Status: GOOD (POC)
- Owner: Agent Platform Engineer
- Next: keep orchestration explicit in code and event logs.

9. Compact errors into context
- Status: GAP
- Owner: Agent Platform Engineer
- Next: failure summarization block for retries.

10. Small focused agents
- Status: GOOD (POC)
- Owner: Product Owner + Agent Platform Engineer
- Next: enforce skill boundaries and runbooks by agent type.

11. Trigger from anywhere
- Status: PARTIAL
- Owner: Agent Platform Engineer
- Next: add external trigger adapters (webhook/queue/WhatsApp bridge).

12. Stateless reducer
- Status: PARTIAL
- Owner: Agent Platform Engineer
- Next: event-driven reducer for run-state transitions.

## Operating Review Cadence

- Weekly review (30 min): principles 1-6 with run metrics.
- Bi-weekly review (30 min): principles 7-12 with UX and safety checks.
- Release gate: no pilot release if tenant isolation, authz, or run observability fails.
