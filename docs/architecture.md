# Architecture Summary

## System Components

- Frontend (`React + TypeScript + Vite`)
  - Workflow Editor: React Flow graph visualization and manual editing
  - Mission Control: agent list, skills, chat, events
- Backend (`Node.js + TypeScript + Express`)
  - Conversation Layer: interprets chat into structured tasks
  - Agent Hub: registry, per-agent runners, skill loading, heartbeat scheduler
  - LLM Router Admin: rules, budgets, usage ledger, metrics
  - Fleet Manager: tenant/cloud/node/agent provisioning metadata + SSH/local bootstrap
  - Execution Layer: workspace-restricted Node tool runner
  - Workflow Layer: JSON versioned workflow persistence
- Workspace & File Persistence
  - `workspace/<agentId>`: config, heartbeat, skills, inputs/outputs, local state
  - `backend/data/agents.json`: registry
  - `backend/data/agents/<agentId>/events.jsonl`: event stream storage
  - `backend/data/llm-router/usage.jsonl`: LLM usage ledger
  - `backend/data/tenants.json`, `clouds.json`, `nodes.json`, `agents.json`: fleet objects

## End-to-End Data Flow

1. User sends chat message from Mission Control to a selected agent.
2. AgentRunner emits `MESSAGE_RECEIVED` and runs interpreter.
3. Interpreter returns task suggestions; AgentRunner emits `INTERPRETATION_RESULT`.
4. AgentRunner builds a versioned `WorkflowPatch` proposal and emits `WORKFLOW_PATCH_PROPOSED`.
5. Agent decides whether to run tools (skills) and emits `TOOL_RUN_STARTED` / `TOOL_RUN_FINISHED`.
6. Agent emits metrics and heartbeat ticks when relevant (`METRIC_RECORDED`, `HEARTBEAT_TICK`).
7. Patch is marked applied in session (`WORKFLOW_PATCH_APPLIED`) and returned to UI.
8. UI polls events and renders logs + patch/tool outcomes.

## Directory Structure

```text
/Users/monotributistar/SOURCES/Talkative /
  backend/
    src/
      agents/
        agentRegistry.ts
        agentHub.ts
        agentRunner.ts
        toolRunner.ts
        workflowPatch.ts
        eventStore.ts
        skillLoader.ts
        types.ts
      routes/
        agentRoutes.ts
        workflowRoutes.ts
        conversationRoutes.ts
      services/
        interpreter.ts
        workflowStore.ts
    data/
      agents.json
      agents/<agentId>/events.jsonl
  frontend/
    src/
      MissionControl.tsx
      WorkflowEditor.tsx
      api.ts
      types.ts
  skills/
    templates/
      mail-triage/
      git-watcher/
      monthly-bookkeeping/
  workspace/
    <agentId>/
      config.json
      HEARTBEAT.md
      skills/
      inputs/
      outputs/
```

## Why This Design

- Workspace-first keeps each agent isolated, inspectable, and portable.
- Skills with progressive disclosure keep startup lightweight while allowing richer behavior on demand.
- Separating conversation, workflow model, and deterministic execution improves trust and debuggability.
- JSON + JSONL persistence makes the POC easy to run locally while preserving migration paths.
- `AgentRunner` interface is process-boundary friendly, so future multi-process / multi-agent scale-up is straightforward.

## Component Diagram

```mermaid
flowchart LR
  U["User"] --> FE["Frontend UI\nWorkflow Editor + Mission Control"]
  FE --> API["Backend API"]

  API --> CL["Conversation Layer\n/interpret"]
  API --> AH["Agent Hub\nRegistry + Router"]
  AH --> AR["AgentRunner (per agent)"]

  AR --> SL["Skill Loader\n(SKILL.md + scripts)"]
  AR --> TR["Tool Runner\n(workspace-only node scripts)"]
  AR --> HB["Heartbeat Scheduler\n(HEARTBEAT.md)"]
  AR --> WP["Workflow Patch Builder"]

  AH --> PS["Persistence\nagents.json + events.jsonl"]
  API --> WS["Workflow Store\nversioned JSON"]
  TR --> WSP["Agent Workspace\n/workspace/<agentId>"]
```

## Message Flow Diagram

```mermaid
sequenceDiagram
  participant User
  participant UI as Mission Control UI
  participant API as Backend API
  participant Hub as AgentHub
  participant Runner as AgentRunner
  participant Tool as ToolRunner
  participant Store as EventStore(JSONL)

  User->>UI: Send message
  UI->>API: POST /agents/:id/message
  API->>Hub: sendMessage(agentId, message)
  Hub->>Runner: handleMessage(message)

  Runner->>Store: MESSAGE_RECEIVED
  Runner->>Runner: interpretConversation()
  Runner->>Store: INTERPRETATION_RESULT
  Runner->>Runner: build WorkflowPatch
  Runner->>Store: WORKFLOW_PATCH_PROPOSED

  alt Tool required
    Runner->>Store: TOOL_RUN_STARTED
    Runner->>Tool: runWorkspaceTool(command)
    Tool-->>Runner: result
    Runner->>Store: TOOL_RUN_FINISHED
    Runner->>Store: METRIC_RECORDED
  end

  Runner->>Store: WORKFLOW_PATCH_APPLIED
  Runner-->>Hub: AgentMessageResponse
  Hub-->>API: response
  API-->>UI: reply + patch + events
  UI->>API: GET /agents/:id/events?tail=N
  API-->>UI: event stream window
```
