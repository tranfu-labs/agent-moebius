# 任务:fix-team-builder-resume-sandbox

- [ ] 在 `src/config.ts:200-231` 的 `buildTeamBuilderExecOptions` 里把 `--sandbox read-only` 与 `--cd <isolatedCwd>` 移到 `common` 数组(适用 full + resume 两模式)
- [ ] 更新 `tests/codex.test.ts:466-487` 的 resume 断言,把 `expect(resume).not.toContain(...)` 反转为 `expect(resume).toContain(...)`
- [ ] 跑真实 codex 续轮冒烟,确认 `--sandbox read-only` + `--cd` 在 resume 场景不会与 thread state 冲突;若冲突则退回只加 `--sandbox`
- [ ] `pnpm typecheck` + `pnpm --filter root test tests/codex.test.ts` 全绿
- [ ] 写 spec-delta 进 `openspec/changes/fix-team-builder-resume-sandbox/spec-delta/desktop-shell/spec.md`,补一条 Requirement 覆盖「execution profile resume 也用只读 sandbox」
- [ ] 写 .task-done.json,phase="implement"
