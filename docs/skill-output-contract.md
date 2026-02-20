# Skill Output Contract

> Ref: [12-Factor Agents – Factor 4: Tools are just structured outputs](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-04-tools-are-structured-outputs.md)

## Problem

Each skill script produced its own ad-hoc JSON shape. The ToolRunner had to
infer artifacts by scanning CLI arguments (`--output`). There was no shared
contract between skills and the runtime that consumed their results.

## Solution

A shared `SkillReportEnvelope` wraps every skill's domain-specific payload
inside a predictable metadata layer.

### Envelope schema

```typescript
interface SkillReportEnvelope<T = unknown> {
  ok: boolean;              // did the skill succeed?
  generatedAt: string;      // ISO-8601 timestamp
  skillName: string;        // matches the template folder name
  data: T;                  // domain payload (triage items, git status, etc.)
  metrics?: Record<string, unknown>;  // optional diagnostics
  error?: { code: string; message: string };  // present when ok === false
}
```

### Example output (mail-triage)

```json
{
  "ok": true,
  "generatedAt": "2026-02-20T05:30:00.000Z",
  "skillName": "mail-triage",
  "data": {
    "totals": { "billing": 1, "work": 1, "personal": 1, "spam": 1 },
    "items": [...]
  },
  "metrics": { "emailCount": 4 }
}
```

### How to use in a new skill

```typescript
import { writeSkillReport } from "../../../lib/skillReport.js";

// ... compute your domain result ...

writeSkillReport(outputPath, "my-skill-name", domainData, {
  metrics: { someCounter: 42 }
});
```

## Affected files

| File | Change |
|------|--------|
| `skills/lib/skillReport.ts` | **New** — shared utility |
| `skills/templates/mail-triage/scripts/triageEmails.ts` | Use `writeSkillReport()` |
| `skills/templates/git-watcher/scripts/gitStatusReport.ts` | Use `writeSkillReport()` |
| `skills/templates/monthly-bookkeeping/scripts/summarizeTransactions.ts` | Use `writeSkillReport()` |

## Backward compatibility

The ToolRunner (`backend/src/agents/toolRunner.ts`) is **not modified**. It
continues to infer artifacts from `--output` arguments and capture
stdout/stderr. The envelope is additive — it standardizes what is *inside*
the output file, not how the file is discovered.

Future work may let the ToolRunner parse the envelope directly to extract
`ok`, `metrics`, and `error` from the skill's own perspective, complementing
the process-level exit code it already tracks.
