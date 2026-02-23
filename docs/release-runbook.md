# Release Runbook + Rollback Checklist

Operational guide for safe releases in Talkative POC.

## Scope

- Backend (`backend`)
- Frontend (`frontend`)
- CI checks (`.github/workflows/ci.yml`)
- Data compatibility for filesystem persistence (`backend/data/*`)

## Release Preconditions

All items must be true before release:

- [ ] Main branch green in CI.
- [ ] PRs for target changes approved and merged.
- [ ] No open P0 incidents affecting agent loop, auth, or data integrity.
- [ ] Environment variables validated for target environment.
- [ ] Known risks and release notes prepared.

## Pre-Release Checklist

Run locally from repo root:

```bash
npm install
npm run test:backend
npm run test:e2e --workspace backend
npm run build
```

Verify:

- [ ] Backend tests pass.
- [ ] E2E critical loop tests pass.
- [ ] Build passes for backend and frontend.
- [ ] No uncommitted release changes.

## Release Procedure

1. Prepare release PR
- [ ] Include concise scope and risk notes.
- [ ] Include rollback plan in PR description.

2. Merge to `main`
- [ ] Confirm CI passed on merge commit.

3. Deploy (target environment)
- [ ] Deploy backend build.
- [ ] Deploy frontend build.
- [ ] Confirm backend process startup is healthy.

4. Smoke tests after deploy
- [ ] `GET /health` responds with `ok: true`.
- [ ] Mission Control loads and agent list endpoint works.
- [ ] Create/start agent flow works.
- [ ] Message flow produces events in `/events`.
- [ ] Router metrics endpoint responds.

## Rollback Triggers

Rollback immediately if any of these occur:

- [ ] Backend fails health check for more than 5 minutes.
- [ ] Critical loop breaks (send message -> no workflow patch/event progression).
- [ ] Error rate spike on `/agents/:id/message` or `/orchestrator/*`.
- [ ] Data corruption risk detected in `backend/data/*`.
- [ ] Security control regressions (auth bypass, role escalation).

## Rollback Procedure

1. Stop forward deploy
- [ ] Freeze additional merges/deploys.

2. Revert to previous known-good revision
- [ ] Deploy previous backend artifact.
- [ ] Deploy previous frontend artifact.

3. Validate rollback
- [ ] `GET /health` stable.
- [ ] Core smoke tests pass.
- [ ] No new data integrity errors in logs.

4. Communication
- [ ] Notify stakeholders with timestamp, impact, and current status.
- [ ] Open incident ticket with root-cause placeholder and timeline.

## Post-Rollback Follow-Up

- [ ] Document failure mode and trigger.
- [ ] Add missing tests to prevent recurrence.
- [ ] Define corrective action and owner.
- [ ] Plan re-release window after fix verification.

## Release Notes Template

Use this short template in PR or release summary:

```text
Release: <version-or-sha>
Date: <UTC timestamp>
Scope:
- <item 1>
- <item 2>

Risk:
- <known risk>

Validation:
- backend tests: pass/fail
- e2e tests: pass/fail
- build: pass/fail

Rollback:
- previous revision: <sha>
- trigger owner: <name>
```
