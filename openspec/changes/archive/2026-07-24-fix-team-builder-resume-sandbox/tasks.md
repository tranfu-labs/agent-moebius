# 任务:fix-team-builder-resume-sandbox

- [x] 在 `src/config.ts:200-231` 的 `buildTeamBuilderExecOptions` 里把 `--sandbox read-only` 与 `--cd <isolatedCwd>` 移到 `common` 数组(适用 full + resume 两模式)
- [x] 更新 `tests/codex.test.ts` 的 resume profile 与最终参数断言,覆盖 flag 存在且位于 `resume` 之前
- [x] 在 `src/codex.ts:525-541` 为 resume 提取 `--sandbox` 与 `--cd` 到 `exec` 之前,其余参数与 full 装配保持不变
- [x] 更新 `desktop/tests/ai-team-builder-codex-spawner.test.ts` 的 resume profile 集成断言,不改 desktop 生产代码
- [x] 跑真实 codex 续轮冒烟,确认 `--sandbox read-only` + `--cd` 在 resume 场景不会与 thread state 冲突(新 thread 的 full 与 parent-level resume 均成功,详见 design.md)
- [x] `pnpm typecheck` + 相关测试全绿(`pnpm test tests/codex.test.ts` 39/39;desktop spawner 2/2)
- [x] 写 spec-delta 进 `openspec/changes/fix-team-builder-resume-sandbox/spec-delta/desktop-shell/spec.md`,补一条 Requirement 覆盖「execution profile resume 也用只读 sandbox」
- [x] 写 .task-done.json,phase="implement"
