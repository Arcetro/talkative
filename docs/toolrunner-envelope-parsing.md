# ToolRunner Envelope Parsing — Factor 1 + Factor 4

> Closes the loop between skill output (PR #21) and runtime consumption.

## Problem

PR #21 standardized what skills *write* (SkillReportEnvelope). But the
ToolRunner still inferred results purely from process exit code and `--output`
argument scanning. It never read the output file to extract skill-level
metadata.

Two specific gaps:

1. **Skill-reported errors invisible.** A skill could write `ok: false` with
   a detailed error, but if the process exited 0 the ToolRunner reported success.

2. **No skill-level metrics.** The ToolRunner tracked `duration_ms` and
   `exit_code` but had no access to domain metrics like `emailCount` or
   `transactionCount` that skills already reported.

## Solution

### `tryParseSkillReport(filePath)`

A lenient parser that reads the output file after process completion:
- If the file is a valid `SkillReportEnvelope` → extract `skillName`, `ok`,
  `generatedAt`, `metrics`, `error`
- If the file is missing, not JSON, or not an envelope → return `undefined`

### Enhanced `ToolRunResult`

New optional field `skillReport` on `ToolRunResult`:

```typescript
skillReport?: {
  skillName: string;
  ok: boolean;
  generatedAt: string;
  metrics?: Record<string, unknown>;
  error?: { code: string; message: string };
};
```

### Trust hierarchy

The ToolRunner now uses **two signals** to determine success:

| Process exit | Envelope ok | Effective ok | Error source |
|-------------|-------------|-------------|--------------|
| 0 | true | true | none |
| 0 | false | **false** | skill's error |
| non-zero | any/missing | false | process stderr |
| 0 | no envelope | true | none (legacy) |

Key insight: a skill that exits 0 but writes `ok: false` is a **soft failure**
(e.g. "parsed the file but found no valid records"). The ToolRunner now
catches this instead of reporting false success.

## Affected files

| File | Change |
|------|--------|
| `backend/src/agents/toolRunner.ts` | Add `tryParseSkillReport()`, `skillReport` field, trust hierarchy |
| `backend/src/agents/toolRunner.test.ts` | 3 new tests (envelope parse, soft failure, non-envelope graceful) |

## Backward compatible

- Scripts that don't use the envelope → `skillReport` is `undefined`,
  behavior identical to before
- Existing tests pass without changes
- `ToolRunResult` field is optional, no consumer breaks
