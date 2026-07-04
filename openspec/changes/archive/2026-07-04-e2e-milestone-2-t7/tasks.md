# Tasks: e2e-milestone-2-t7

- [x] Inspect the current T7 issue context and issue 48 historical evidence.
- [x] Start the observer locally and create `artifacts/acceptance/m2-t7-observer.png` as either current-issue evidence or a diagnostic screenshot.
- [x] Run a bounded fake-`gh` fast-failure PATH-mask injection and record retry / failure scheduling, intake cursor behavior, and absence of half-complete comments.
- [x] Run or explicitly mark inconclusive a bounded fake-`gh` hang-mode injection, distinguishing runner-owned GitHub CLI timeout from the external experiment timeout.
- [x] Remove the PATH mask and verify recovery with a bounded heartbeat when safe; otherwise record why recovery is deferred to the outer runner publication path.
- [x] Exercise dead-letter only if intentionally chosen and accepted; otherwise record why recovery, not dead-letter exhaustion, is the T7 self-healing path.
- [x] Append the T7 drill record to `docs/roadmap/milestone-2-stability-oracle.md` without changing T5 status.
- [x] Save any observer screenshot under `artifacts/acceptance/` and reference it in the final response.
- [x] Run `git diff --check`, `pnpm test`, and `pnpm typecheck`.
- [x] Review implementation against this plan before emitting `code-verified`.
