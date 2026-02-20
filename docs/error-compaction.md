# Error Compaction — Factor 9

> Ref: [12-Factor Agents – Factor 9: Compact Errors into Context](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-09-compact-errors-into-context.md)

## Problem

When a tool fails, the AgentRunner emits a `TOOL_RUN_FINISHED` event with
`ok: false`, an error code, and metrics. However the context builder treated
all recent events as flat text lines (`"- TOOL_RUN_FINISHED: Tool failed"`),
discarding the structured error payload.

The LLM had no way to know *what* failed, *why*, or *how long* it took — only
that something went wrong.

## Solution

### `compactErrors(events)`

A pure function in `contextBuilder.ts` that:

1. Filters events for `TOOL_RUN_FINISHED` where `payload.ok === false`
2. Extracts `command`, `error.code`, `error.message`, `metrics.exit_code`
3. Produces a compact `[RECENT ERRORS]...[/RECENT ERRORS]` block

### Integration with `buildDeterministicContext()`

The error block is appended to the context **only when failures exist**.
Zero failures = no block = no wasted tokens.

### Example context output

```
Prompt: You are a business workflow subagent.

User Message: triage my inbox

Skills: mail-triage

Recent Events:
- MESSAGE_RECEIVED: triage my inbox
- TOOL_RUN_FINISHED: Tool failed: node skills/mail-triage/scripts/triageEmails.ts

[RECENT ERRORS]
1 tool failure(s) detected:
  - command: node skills/mail-triage/scripts/triageEmails.ts | code: TOOL_EXIT_NON_ZERO | exit: 1 | reason: Cannot read input file
Consider: retry with different input, skip the failing step, or request human help.
[/RECENT ERRORS]
```

## Interface change

The `recentEvents` parameter of `buildDeterministicContext()` now accepts
`ContextEvent` instead of `{ type: string; message: string }`:

```typescript
export interface ContextEvent {
  type: string;
  message: string;
  payload?: {
    ok?: boolean;
    error?: { code: string; message: string };
    metrics?: { duration_ms?: number; exit_code?: number | null };
    command?: string;
    [key: string]: unknown;
  };
}
```

**Backward compatible:** `payload` is optional, so callers that pass plain
`{ type, message }` objects continue to work without changes.

## Affected files

| File | Change |
|------|--------|
| `backend/src/prompt/contextBuilder.ts` | Add `ContextEvent`, `compactErrors()`, integrate into builder |
| `backend/src/prompt/contextBuilder.test.ts` | Add 6 new tests, preserve 2 existing |

## Future work

The AgentRunner currently maps events as `{ type, message }` when calling the
builder. A follow-up PR can forward the full `payload` to unlock the error
compaction at runtime. This PR establishes the contract and logic; the wiring
is a separate, small change.
