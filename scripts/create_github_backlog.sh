#!/usr/bin/env bash
set -euo pipefail

REPO="monotributistar/talkative"
MILESTONE="Pilot Readiness Sprint (2 weeks)"

create_label() {
  local name="$1"
  local color="$2"
  local desc="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null || \
    gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null
}

echo "==> Creating/updating labels"
create_label "area/backend" "1D76DB" "Backend/API/domain work"
create_label "area/frontend" "5319E7" "Frontend/UI work"
create_label "area/fleet" "0E8A16" "Fleet/provisioning work"
create_label "area/router" "0052CC" "LLM router/admin work"
create_label "area/security" "B60205" "Security/auth/secrets"
create_label "area/ops" "FBCA04" "DevOps/CI/CD/infra"
create_label "area/testing" "C5DEF5" "Testing/e2e/qa"
create_label "prio/p0" "D93F0B" "Must have for pilot"
create_label "prio/p1" "E99695" "Important"
create_label "prio/p2" "F9D0C4" "Nice to have"
create_label "sprint/week-1" "BFD4F2" "Week 1"
create_label "sprint/week-2" "C2E0C6" "Week 2"
create_label "type/feature" "0E8A16" "Feature work"
create_label "type/chore" "FBCA04" "Chore/maintenance"

if ! gh api --silent "repos/$REPO/milestones" | rg -q "\"title\":\"$MILESTONE\""; then
  echo "==> Creating milestone"
  gh api "repos/$REPO/milestones" -X POST -f title="$MILESTONE" -f state="open" >/dev/null
else
  echo "==> Milestone already exists"
fi

create_issue() {
  local title="$1"
  local labels="$2"
  local body="$3"

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --milestone "$MILESTONE" \
    --label "$labels" \
    --body "$body" >/dev/null

  echo "  created: $title"
}

echo "==> Creating Week 1 issues"

create_issue "AUTH-01: JWT auth middleware for backend" "area/backend,area/security,prio/p0,sprint/week-1,type/feature" "
## Goal
Add JWT authentication middleware for backend routes.

## Scope
- Token verification middleware
- Protected route groups for /agents, /fleet, /router/admin
- Standard auth error responses

## Acceptance
- Unauthenticated requests are rejected on protected routes
- Authenticated requests pass through
- Token secret only in backend env
"

create_issue "AUTH-02: RBAC roles (admin/operator/viewer)" "area/backend,area/security,prio/p0,sprint/week-1,type/feature" "
## Goal
Introduce role-based authorization.

## Scope
- Role claims in JWT
- Route-level role checks
- Admin-only router/fleet mutations

## Acceptance
- Role checks enforced on mutating endpoints
- Clear 403 responses with reason
"

create_issue "MT-01: Enforce tenant_id across all API queries and writes" "area/backend,prio/p0,sprint/week-1,type/feature" "
## Goal
Guarantee tenant isolation.

## Scope
- Every create/read/update path filters by tenant_id
- Remove implicit cross-tenant access
- Validate tenant_id presence in payloads

## Acceptance
- All records written with tenant_id and agent_id
- Cross-tenant reads blocked
"

create_issue "DB-01: Introduce PostgreSQL + Prisma schema" "area/backend,area/ops,prio/p0,sprint/week-1,type/feature" "
## Goal
Move from JSON/JSONL to DB-backed persistence for pilot.

## Scope
- Prisma setup + initial models (agents, events, router usage, rules, budgets, nodes)
- Local docker-compose postgres service

## Acceptance
- Backend runs with DB in local env
- Basic CRUD paths migrated
"

create_issue "DB-02: Data migration script from JSON/JSONL to DB" "area/backend,prio/p1,sprint/week-1,type/feature" "
## Goal
Migrate existing filesystem state.

## Scope
- One-shot migration command
- Idempotent behavior
- Validation report

## Acceptance
- Existing agents/events/router usage imported
- Migration can be re-run safely
"

create_issue "OBS-01: Structured logging with request_id tenant_id agent_id run_id" "area/backend,area/ops,prio/p0,sprint/week-1,type/feature" "
## Goal
Make logs operationally useful.

## Scope
- Structured logger (JSON)
- Request-scoped IDs
- Include tenant_id/agent_id/run_id fields

## Acceptance
- Logs are JSON and queryable
- Error logs include context IDs
"

create_issue "OBS-02: Prometheus metrics endpoint and core counters" "area/backend,area/ops,prio/p1,sprint/week-1,type/feature" "
## Goal
Expose runtime health and usage metrics.

## Scope
- /metrics endpoint
- Counters: runs, tool calls, failures, router cost/tokens
- Latency histograms for key endpoints

## Acceptance
- Metrics scrape works locally
- Dashboard-ready metric names documented
"

create_issue "CICD-01: GitHub Actions pipeline (lint, typecheck, test, build)" "area/ops,area/testing,prio/p0,sprint/week-1,type/feature" "
## Goal
Prevent regressions and ensure reproducible quality checks.

## Scope
- CI workflow on PR and main
- Parallel jobs for backend/frontend
- Build artifacts on success

## Acceptance
- Pipeline required for merge
- Failing checks block merge
"

create_issue "SEC-01: Secrets policy and startup validation" "area/security,area/backend,prio/p0,sprint/week-1,type/chore" "
## Goal
Harden secret handling.

## Scope
- Validate required env vars at startup
- No secret paths/values in frontend
- Document secret rotation basics

## Acceptance
- Startup fails fast when required secrets missing
- README security section updated
"

create_issue "OPS-01: Dockerfiles + docker-compose for local deploy" "area/ops,prio/p1,sprint/week-1,type/feature" "
## Goal
Enable one-command local deployment.

## Scope
- Backend/Frontend Dockerfiles
- Compose stack with postgres
- Healthchecks and env templates

## Acceptance
- docker compose up launches full app
- App reachable and functional
"

echo "==> Creating Week 2 issues"

create_issue "RUN-01: Unified run state model (run_id + steps + status)" "area/backend,prio/p0,sprint/week-2,type/feature" "
## Goal
Unify execution state and business state.

## Scope
- Run entity with lifecycle
- Step records for interpretation/tool calls/patches
- Status transitions with timestamps

## Acceptance
- Every message creates/updates a run
- Mission Control can query run state
"

create_issue "RUN-02: Pause/Resume/Cancel APIs with checkpoints" "area/backend,prio/p0,sprint/week-2,type/feature" "
## Goal
Control long-running agents safely.

## Scope
- POST /runs/:id/pause
- POST /runs/:id/resume
- POST /runs/:id/cancel
- Checkpoint persistence

## Acceptance
- Paused runs stop progressing
- Resume continues from checkpoint
"

create_issue "PROMPT-01: Prompt registry with versioning per tenant_id+agent_id" "area/backend,area/router,prio/p0,sprint/week-2,type/feature" "
## Goal
Own prompts explicitly.

## Scope
- Prompt versions stored per tenant+agent
- Activate/rollback version APIs
- Reference active prompt in runs

## Acceptance
- Prompt changes are auditable
- Rollback works
"

create_issue "CTX-01: Deterministic context builder and truncation policy" "area/backend,area/router,prio/p0,sprint/week-2,type/feature" "
## Goal
Own context window composition.

## Scope
- Explicit context sources
- Token budget and truncation strategy
- Context summary metadata in run logs

## Acceptance
- Context assembly deterministic for same inputs
- Over-budget contexts are safely compacted
"

create_issue "ERR-01: Error compaction for retry context" "area/backend,prio/p1,sprint/week-2,type/feature" "
## Goal
Turn failures into concise retry context.

## Scope
- Summarize tool/LLM errors
- Store compact error block in run step
- Use in retry prompts

## Acceptance
- Retries include compacted error context
- Raw and compacted errors both retained
"

create_issue "HITL-01: Human approval tool + UI approve/reject" "area/backend,area/frontend,prio/p0,sprint/week-2,type/feature" "
## Goal
Add human-in-the-loop control point.

## Scope
- Tool call: request_human_approval
- Mission Control queue for approvals
- Approve/reject endpoints

## Acceptance
- Sensitive actions can block pending approval
- Approval decision resumes flow
"

create_issue "TOOLS-01: Standard tool result contract" "area/backend,prio/p1,sprint/week-2,type/feature" "
## Goal
Normalize tool outputs.

## Scope
- Contract fields: ok, error, artifacts, metrics
- Update existing skills/tool runner wrappers

## Acceptance
- All tool executions emit the same schema
- Event logs include contract fields
"

create_issue "FLEET-01: Provisioning hardening (prechecks, retries, idempotency)" "area/fleet,area/security,prio/p1,sprint/week-2,type/feature" "
## Goal
Make fleet provisioning reliable.

## Scope
- SSH prechecks
- Timeout/retry policy
- Idempotent provisioning behavior

## Acceptance
- Re-provision does not corrupt existing node state
- Clear status/result on failures
"

create_issue "E2E-01: End-to-end test suite for critical agent loop" "area/testing,area/backend,area/frontend,prio/p0,sprint/week-2,type/feature" "
## Goal
Protect the chat->patch->tool loop.

## Scope
- Tests for create agent, attach skill, send message, run heartbeat
- Assert patch and output artifacts
- Include pause/resume path

## Acceptance
- E2E passes in CI
- Failures provide actionable logs
"

create_issue "REL-01: Release runbook + rollback checklist" "area/ops,prio/p1,sprint/week-2,type/chore" "
## Goal
Operational readiness for pilot.

## Scope
- Deployment checklist
- Smoke tests after deploy
- Rollback procedure

## Acceptance
- Team can execute release from docs only
"

echo "==> Done. Open issues:"
gh issue list --repo "$REPO" --limit 100 --state open --search "milestone:\"$MILESTONE\"" --json number,title,url --jq '.[] | "#\(.number) \(.title) -> \(.url)"'
