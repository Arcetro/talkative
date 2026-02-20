# EventStore Pruning

## Problem

The EventStore appends events to a JSONL file that grows indefinitely.
`readAgentEvents()` reads the entire file into memory and then slices the
last N lines. For active agents with frequent heartbeats (every 5 minutes),
the log grows by ~20-30 events/hour. Over days or weeks this causes:

1. **Increasing memory pressure** on every `readAgentEvents()` call
2. **Slower reads** as the file grows
3. **Unbounded disk usage** per agent

## Solution

### New exports

| Function | Purpose |
|----------|---------|
| `countAgentEvents(agentId)` | Count lines without parsing |
| `pruneAgentEvents(agentId, keep)` | Rewrite file keeping last N events |
| `autoPruneIfNeeded(agentId)` | Prune only if count > PRUNE_THRESHOLD |
| `PRUNE_THRESHOLD` | 500 events (configurable constant) |
| `PRUNE_KEEP` | 200 events retained after pruning |

### Usage

`autoPruneIfNeeded()` is designed to be called in hot paths like heartbeat
completion or after batch tool runs. It's cheap when under threshold (one
`readFile` + line count) and only rewrites when needed.

```typescript
// In AgentRunner.runHeartbeat(), after all commands complete:
await autoPruneIfNeeded(this.agent.id);
```

### Pruning strategy

Keep the **most recent** events. Older events are discarded. This matches
how the system uses events — the context builder only looks at the last 8,
the dashboard shows recent activity. Historical events can be preserved via
external log aggregation if needed.

## Tests

First test suite for EventStore (previously untested):

- append and read events
- readAgentEvents respects limit
- readAgentEvents returns empty for unknown agent
- countAgentEvents correct count / unknown agent
- pruneAgentEvents keeps most recent N
- pruneAgentEvents no-op when under threshold
- autoPruneIfNeeded threshold behavior

## Affected files

| File | Change |
|------|--------|
| `backend/src/agents/eventStore.ts` | Add count, prune, autoPrune functions |
| `backend/src/agents/eventStore.test.ts` | **New** — first test suite for EventStore |

## Future work

- Call `autoPruneIfNeeded()` from AgentRunner heartbeat/tool execution paths
- Consider archiving pruned events to a separate `.archive.jsonl` file
- Make thresholds configurable per agent via workspace config
