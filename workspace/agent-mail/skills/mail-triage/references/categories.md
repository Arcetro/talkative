# Categories & heuristics (POC)

## billing
Signals:
- subject/snippet contains: invoice, receipt, factura, pago, payment, subscription, vencimiento
- from domains: banks, payment processors (in POC use keyword-based only)

Action:
- mark as "needs_review" + "store_record"

## work
Signals:
- subject/snippet contains: PR, merge, deploy, incident, ticket, sprint, roadmap, meeting, standup

Action:
- mark as "needs_reply" or "add_to_tasks"

## personal
Signals:
- friendly tone, family names, non-work topics
- subject/snippet contains: cumple, asado, familia, plan, finde, viaje

Action:
- mark as "read_later" or "reply"

## spam
Signals:
- urgent money claims, suspicious promotions, fake warnings
- subject/snippet contains: prize, winner, claim now, verify account, password expired

Action:
- mark as "ignore" or "block_sender"
