# 任务：interrupt-running-dev-on-new-comment

- [x] 新增 driver-agnostic conversation interrupt helper 与单元测试。
- [x] 让 `codex.run` 支持 `AbortSignal` 中断，并补充测试。
- [x] 在 runner 的 `dev` Codex run 周围接入 GitHub conversation snapshot monitor。
- [x] 增加 `interrupted` intake outcome，并确保不推进到新 comment 的 updatedAt。
- [x] 更新 `github-issue-runner` spec delta、模块地图和相关测试。
- [x] 运行 `pnpm test` 与 `pnpm typecheck`。
