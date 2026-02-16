---
name: git-watcher
description: |
  Inspect a local repository path inside the agent workspace and generate a concise git status report.
---

# Git Watcher Skill

## What this skill does
- Reads git status for a workspace-local repository path
- Writes a JSON report with branch, dirty flag, and changed files

## Tool command (run inside workspace)
node skills/git-watcher/scripts/gitStatusReport.ts --repo . --output outputs/git-status.json

## Output
- `generatedAt`
- `repoPath`
- `branch`
- `isDirty`
- `changedFiles`

## Notes
If target path is not a git repo, script outputs a mock-safe report with `isGitRepo=false`.
