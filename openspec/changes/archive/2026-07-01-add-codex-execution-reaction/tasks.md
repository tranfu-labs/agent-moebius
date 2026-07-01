# 任务：add-codex-execution-reaction

- [x] 在 `src/github.ts` 增加 `addIssueReaction` 与 reaction 参数构造函数。
- [x] 在 runner 的 Codex driver 路径中，于 preScript 成功后、首次 `runCodex` 前添加 `eyes` reaction。
- [x] 为 reaction 成功与失败增加结构化日志；失败不阻断 Codex 执行。
- [x] 增加单元测试覆盖 GitHub reaction 参数构造，以及 runner 只在真实 Codex 执行路径添加 reaction、不在 hook/no-trigger/preScript 失败路径添加 reaction。
- [x] 确认 `spec-delta/github-issue-runner.md` 覆盖新增行为、排除路径、失败策略与验证要求。
- [x] 运行 `pnpm test` 与 `pnpm typecheck`。
