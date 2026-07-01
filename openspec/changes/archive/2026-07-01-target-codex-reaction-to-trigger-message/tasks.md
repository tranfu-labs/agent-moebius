# 任务：target-codex-reaction-to-trigger-message

- [x] 在 `src/github.ts` 增加显式 `ReactionTarget` / `addReaction`，支持 issue REST reaction 与 issue comment GraphQL reaction。
- [x] 将 `GitHubComment` shape 扩展为包含 comment `id`，并更新 shape 校验与测试 helper。
- [x] 在 `src/runner.ts` 根据本轮 trigger / prompt plan 的 latest index 解析 Codex execution reaction target。
- [x] 调整 `addCodexExecutionReaction` 依赖与日志，使成功 / 失败事件记录 `targetSource` 与 `targetIndex`，且失败仍不阻断 Codex。
- [x] 更新 runner 单元测试：issue body 触发仍 reaction 到 issue；latest comment 触发 reaction 到对应 comment；no-trigger / hook / preScript failed / prompt skip 仍不添加 reaction；resume fallback 不重复 reaction。
- [x] 更新 GitHub adapter 单元测试：issue reaction 参数保持兼容；comment reaction GraphQL 参数安全且 content 映射为 `EYES`。
- [x] 运行 `pnpm typecheck`、`pnpm test` 与 `git diff --check`。
