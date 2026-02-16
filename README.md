# Conversational Workflow Agent + Agent Hub (POC)

A local proof-of-concept that combines:
- Workflow creation from conversation (React Flow + interpreter)
- Mission Control for running multiple lightweight in-process agents
- LLM Router Admin for rules, usage, budgets, and metrics
- Fleet Manager v0 for node registration and remote/local provisioning

## Architecture

- Detailed architecture summary and diagrams:
  - `/Users/monotributistar/SOURCES/Talkative /docs/architecture.md`

## Stack

- Frontend: React + TypeScript + Vite + React Flow
- Backend: Node.js + TypeScript + Express
- Persistence: JSON files (filesystem)
- Realtime stream: server-sent events (`GET /events`)

## Project Layout

- `/Users/monotributistar/SOURCES/Talkative /backend/src/routes`: HTTP API routes
- `/Users/monotributistar/SOURCES/Talkative /backend/src/services`: workflow + conversation services
- `/Users/monotributistar/SOURCES/Talkative /backend/src/agents`: Agent Hub module (`AgentRunner`, registry, tool runner, heartbeat)
- `/Users/monotributistar/SOURCES/Talkative /frontend/src/WorkflowEditor.tsx`: existing workflow visual editor
- `/Users/monotributistar/SOURCES/Talkative /frontend/src/MissionControl.tsx`: new agent control UI
- `/Users/monotributistar/SOURCES/Talkative /skills/templates`: reusable skill templates
- `/Users/monotributistar/SOURCES/Talkative /workspace/<agentId>`: per-agent isolated workspace

## Backend APIs

### Workflow APIs (existing)
- `POST /workflow`
- `GET /workflow/:id`
- `POST /node`
- `PATCH /node/:id`
- `POST /conversation/interpret`

### Agent Hub APIs (new)
- `GET /agents`
- `POST /agents`
- `POST /agents/:id/start`
- `POST /agents/:id/stop`
- `GET /agents/:id/events?tail=50`
- `GET /agents/:id/skills`
- `POST /agents/:id/skills/attach`
- `POST /agents/:id/message`

Optional auto-router endpoint:
- `POST /agents/message` (simple keyword classifier chooses agent)

### LLM Router Admin APIs

- `GET /router/admin/rules`
- `PUT /router/admin/rules`
- `GET /router/admin/usage?tenant_id=&agent_id=&limit=&from=&to=`
- `GET /router/admin/budgets`
- `PUT /router/admin/budgets`
- `GET /router/metrics`

Usage ledger path:
- `/Users/monotributistar/SOURCES/Talkative /backend/data/llm-router/usage.jsonl`

Usage records include:
- `tenant_id`
- `agent_id`
- `model`
- `tokens`
- `cost`
- `latency_ms`
- `status`

### Fleet Manager APIs

- `POST /fleet/nodes`
- `POST /fleet/agents`
- `POST /fleet/agents/:id/provision`

### Orchestrator APIs (contract + lifecycle)

- `GET /orchestrator/contracts`
- `POST /orchestrator/commands`
- `POST /orchestrator/events`
- `GET /orchestrator/runs/:run_id`
- `GET /orchestrator/runs?tenant_id=&agent_id=&limit=`

Fleet persistence:
- `/Users/monotributistar/SOURCES/Talkative /backend/data/tenants.json`
- `/Users/monotributistar/SOURCES/Talkative /backend/data/clouds.json`
- `/Users/monotributistar/SOURCES/Talkative /backend/data/nodes.json`
- `/Users/monotributistar/SOURCES/Talkative /backend/data/agents.json`

## Agent Hub Design

Each agent is an in-process `AgentRunner` object (not a separate OS process yet).

Responsibilities:
1. Load workspace config from `workspace/<agentId>/config.json`
2. Load skills from `workspace/<agentId>/skills/*/SKILL.md`
3. Run workspace tools in safe mode (Node scripts only)
4. Schedule heartbeats (default 30 min) using `HEARTBEAT.md`
5. Handle messages and emit structured events

### Persistence

- Agent registry: `/Users/monotributistar/SOURCES/Talkative /backend/data/agents.json`
- Agent events log: `/Users/monotributistar/SOURCES/Talkative /backend/data/agents/<agentId>/events.jsonl`

### Workspace Safety Rules

- Tool runner only allows `node ...` commands
- For `.ts` scripts it executes via Node with `--import tsx`
- Input/output/script paths are validated to stay inside `workspace/<agentId>`
- Rejects dangerous command patterns (`rm`, `mkfs`, `shutdown`, etc.)

## Skills Format

Templates live in:
- `/Users/monotributistar/SOURCES/Talkative /skills/templates/<skillName>/SKILL.md`
- Optional: `scripts/*`
- Optional: `references/*`

Included templates:
- `mail-triage` (fully working)
- `git-watcher` (runnable)
- `monthly-bookkeeping` (runnable)

## Mail-Triage Skill

Command (through tool runner / heartbeat):
- `node skills/mail-triage/scripts/triageEmails.ts --input inputs/emails.sample.json --output outputs/triage-result.json`

Input: mock email JSON array.
Output: categorized result (`billing`, `work`, `personal`, `spam`) with totals.

## Mission Control UI

Open the app and switch to **Mission Control** to:
- List agents with status and last heartbeat
- Create agents with template (`mail-triage`, `git-watcher`, `monthly-bookkeeping`)
- Start/stop agents
- Attach skills
- View event logs (polling)
- Send chat messages to a selected agent

Open **Router Admin** (or visit `/router-admin`) to:
- view router metrics
- edit/save rules with JSON validation
- inspect usage by tenant/agent
- edit/save budget caps

## Example Workspace

Seeded example agent workspace:
- `/Users/monotributistar/SOURCES/Talkative /workspace/agent-mail/config.json`
- `/Users/monotributistar/SOURCES/Talkative /workspace/agent-mail/HEARTBEAT.md`
- `/Users/monotributistar/SOURCES/Talkative /workspace/agent-mail/inputs/emails.sample.json`

## Run Locally

1. Install dependencies:
```bash
npm install
```

2. Start backend:
```bash
npm run dev:backend
```

3. Start frontend (new terminal):
```bash
npm run dev:frontend
```

4. Open:
- [http://localhost:5173](http://localhost:5173)

## Fleet Quickstart

### 1) Register a node (local mock target)

```bash
curl -X POST http://localhost:4000/fleet/nodes \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id":"tenant-default",
    "cloud_id":"cloud-local",
    "name":"local-dev-node",
    "mode":"local",
    "base_path":"/tmp/agentd-fleet"
  }'
```

### 2) Create a fleet agent spec

```bash
curl -X POST http://localhost:4000/fleet/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "id":"agent-fleet-mail",
    "tenant_id":"tenant-default",
    "cloud_id":"cloud-local",
    "name":"Fleet Mail Agent",
    "skills":["mail-triage"]
  }'
```

### 3) Provision the agent on the node

```bash
curl -X POST http://localhost:4000/fleet/agents/agent-fleet-mail/provision \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id":"tenant-default",
    "node_id":"<node_id_from_step_1>",
    "skills":["mail-triage"]
  }'
```

For local mode, provisioning writes status at:
- `/tmp/agentd-fleet/<agentId>/status.json`

### SSH mode notes

- Set SSH key path on backend only (never in frontend):
  - `FLEET_SSH_KEY_PATH=/absolute/path/to/private_key`
- Register node with `"mode":"ssh"` plus `ssh_host`, `ssh_user`, `ssh_port`.
- Provision endpoint then executes SSH/SCP bootstrap.

## Quick Test Flow

1. In Mission Control, select `agent-mail`
2. Click **Start Agent**
3. Send message: `triage inbox now`
4. Check events list for `WORKFLOW_PATCH_PROPOSED`, `TOOL_RUN_STARTED`, `TOOL_RUN_FINISHED`
5. Verify output file:
- `/Users/monotributistar/SOURCES/Talkative /workspace/agent-mail/outputs/triage-result.json`

## Quickstart: Agent Loop

1. Create agent in Mission Control:
   - Name: `Bookkeeper`
   - Template: `monthly-bookkeeping`
2. Start agent.
3. Attach additional skills (optional) from the Skills panel.
4. Send chat:
   - `run heartbeat now`
   - or `triage inbox now` (for mail skill)
5. Inspect generated outputs in the agent workspace:
   - `outputs/bookkeeping-report.json`
   - `outputs/git-status.json`
   - `outputs/triage-result.json`
6. Use Workflow Editor tab to visualize / refine the process graph while chat-driven patches are produced by agents.

## Multi-tenant record fields

All fleet objects, router usage rows, and agent events include:
- `tenant_id`
- `agent_id`
# talkative
