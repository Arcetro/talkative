# Wire Event Payload to Context Builder

> Completes the error compaction pipeline started in PR #21 and PR #22.

## Problem

PR #22 added `compactErrors()` to the context builder, capable of extracting
structured error info from `ContextEvent.payload`. However the AgentRunner
was still mapping events as `{ type, message }`, discarding the payload.

The error compaction logic existed but was never activated at runtime.

## Solution

Forward `payload` from stored events when building the LLM context:

```typescript
// Before
recentEvents: recent.map((row) => ({ type: row.type, message: row.message }))

// After
recentEvents: recent.map((row): ContextEvent => ({
  type: row.type,
  message: row.message,
  ...(row.payload ? { payload: row.payload } : {})
}))
```

## What this enables

When a tool fails, the full pipeline now works end-to-end:

1. **Skill** writes `SkillReportEnvelope` with `ok: false` and error details (PR #21)
2. **ToolRunner** captures exit code, stdout, stderr → `ToolRunResult`
3. **AgentRunner** emits `TOOL_RUN_FINISHED` event with `{ ok, error, metrics, command }`
4. **EventStore** persists the full payload to JSONL
5. **AgentRunner.handleMessage()** reads recent events **with payload** ← this PR
6. **contextBuilder.compactErrors()** detects failures and produces `[RECENT ERRORS]` block (PR #22)
7. **LLM** receives structured error context and can reason about retry/skip/escalate

## Affected files

| File | Change |
|------|--------|
| `backend/src/agents/agentRunner.ts` | Import `ContextEvent`, forward `payload` in event mapping |

## Depends on

- PR #22 (`ContextEvent` interface and `compactErrors()` must exist in contextBuilder)
