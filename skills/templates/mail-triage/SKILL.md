---
name: mail-triage
description: |
  Classify incoming emails into practical categories (billing, work, personal, spam)
  and output a structured triage report. Designed to be used by the Agent Hub tool-runner.
---

# Mail Triage Skill

## What this skill does
- Takes a JSON list of emails (mock data in this POC)
- Classifies each email into:
  - billing
  - work
  - personal
  - spam
- Generates a triage report JSON with:
  - category counts
  - per-email labels
  - suggested actions

## Inputs
- A JSON file containing an array of emails:
  - id, from, subject, snippet, date (optional), labels (optional)

## Outputs
- A JSON report with:
  - totals per category
  - per email: category + action + confidence

## Tool command (run inside workspace)
node skills/mail-triage/scripts/triageEmails.ts --input <input.json> --output <report.json>

## Rules (high level)
See references/categories.md
