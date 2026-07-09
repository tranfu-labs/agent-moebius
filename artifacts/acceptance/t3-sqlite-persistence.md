# T3 SQLite Persistence Acceptance Evidence

Date: 2026-07-09

## Commands

- `pnpm vitest run tests/agent-context-state.test.ts tests/github-intake-state.test.ts tests/goal-ledger-state.test.ts tests/observer.test.ts tests/runner.test.ts tests/issue-worktree.test.ts tests/dev-workspace.test.ts` -> exit 0, 7 files / 143 tests passed.
- `pnpm vitest run tests/state.test.ts tests/sqlite-state.test.ts tests/local-console.test.ts` -> exit 0, 3 files / 16 tests passed.
- `pnpm typecheck` -> exit 0.
- `pnpm test` -> exit 0, root 35 files / 393 tests, desktop 5 files / 15 tests, console-ui 2 files / 6 tests passed.
- `git diff --check` -> exit 0.

## Acceptance Mapping

1. Local restart consistency: `tests/local-console.test.ts` verifies messages survive store re-open on the same SQLite file; `tests/sqlite-state.test.ts` verifies role threads, intake, goal ledger, and agent contexts migrate into SQLite and remain the persisted source.
2. GitHub no-drift gate: `pnpm test` passed, including targeted runner/worktree/dev workspace suites for role resume, intake cursor behavior, reactions, comments, worktree path, and branch behavior.
3. Permanent hang / worker stuck: `src/sqlite-state.ts` terminates timed-out workers; `tests/local-console.test.ts` covers visible store timeout without Codex start and subsequent lock release.
4. Real SQLite busy/lock: `tests/local-console.test.ts` holds a real exclusive SQLite lock, observes a 503 store error, verifies Codex is not called, and verifies the next message succeeds after unlock.
5. Partial migration failure: `tests/sqlite-state.test.ts` injects import failure after table writes, verifies no imported marker, then retries without duplicate or missing records.
6. Corrupted legacy source boundary: state adapter tests reject invalid source files; observer tests keep unrelated legacy issue/run records visible while reporting malformed ledger diagnostics.
7. Legacy role thread resume isolation: `tests/state.test.ts` verifies legacy issue-key role threads migrate with same issue + role thread id preserved and different issues isolated; `tests/runner.test.ts` verifies resume uses the stored thread id.
8. Legacy JSON no longer written: `tests/sqlite-state.test.ts` verifies post-migration saves for role threads, intake, goal ledger, and agent contexts leave legacy `.state/*.json` mtime/content unchanged.
