# Orchestrator and Subagent Communication Model (POC)

## Control Plane vs Data Plane

- Control Plane (Orchestrator)
  - receives commands
  - tracks run lifecycle
  - applies tenant and budget policies
  - stores canonical run state
- Data Plane (Subagents)
  - execute tasks and tools
  - emit events and results back to orchestrator

## Message Contracts

- Commands (`/orchestrator/commands`): `start_task`, `pause`, `resume`, `cancel`, `request_delegate`
- Events (`/orchestrator/events`): `state_changed`, `tool_started`, `tool_finished`, `metric_recorded`, `error_compacted`

All envelopes require:
- `tenant_id`
- `agent_id`
- `run_id`

## Channel Separation

- User/Operator Channel
  - Mission Control + Router Admin
  - internal operations and approvals
- Client Channel
  - external APIs/webhooks/messaging adapters (future)
  - requests are normalized and routed through orchestrator

Rule: clients do not interact directly with subagents.

## Subagent-to-Subagent Communication

POC policy:
- No direct P2P subagent communication.
- Subagents request delegation through orchestrator.
- Orchestrator creates/coordinates downstream commands and tracks all events.
