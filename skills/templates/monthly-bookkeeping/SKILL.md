---
name: monthly-bookkeeping
description: |
  Aggregate a CSV of transactions into totals by category and month for quick bookkeeping summaries.
---

# Monthly Bookkeeping Skill

## What this skill does
- Reads transactions CSV (`date,description,category,amount`)
- Outputs totals by category and global balance

## Tool command (run inside workspace)
node skills/monthly-bookkeeping/scripts/summarizeTransactions.ts --input inputs/transactions.sample.csv --output outputs/bookkeeping-report.json

## Output
- totalsByCategory
- incomeTotal
- expenseTotal
- net
