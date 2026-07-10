Closes #109
Closes #116

## T5 Integration Evidence
- Evidence artifact: `artifacts/acceptance/t5-evidence.json`
- Acceptance entrypoint: `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case all`
- Evidence scope: multi-child local goal, CEO no-mention route, `parent_session_id` session tree, qa/product-manager walkthrough and parent integration return, worktree branch/diff return/original cleanliness parity, local dead-letter recovery, roadmap evidence, PR body draft evidence, and fake `gh` zero-call coverage for the local acceptance entrypoint.

## MUST Matrix
- Source spec: `openspec/specs/github-issue-runner/spec.md`
- Matrix path: `openspec/changes/local-console-t5-full-parity/proposal.md`
- Task index: `openspec/changes/local-console-t5-full-parity/tasks.md`
- Current count: 564 lines containing `MUST`; 475 bullet `- MUST` lines are not the acceptance counting scope.

## Verification
- `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case all` -> exit code 0
- `pnpm test` -> exit code 0
- `pnpm typecheck` -> exit code 0
- `pnpm --filter @agent-moebius/desktop build` -> exit code 0
- `pnpm --filter @agent-moebius/console-ui test` -> exit code 0
- `git diff --check` -> exit code 0

## Roadmap
- `docs/roadmap/milestone-4-local-console.md` marks T5 `[x]` and records the T5 evidence summary.
