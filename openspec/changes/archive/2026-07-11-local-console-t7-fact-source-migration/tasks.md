# 任务：local-console-t7-fact-source-migration

- [x] 从 `github-issue-runner` spec 迁出 observer/T7 呈现类要求与场景，保留 GitHub runner 核心语义。
- [x] 在 `local-console` spec 增加本地操作台诊断、ledger-first 展示、GitHub 呈现类只读事实与零写入零外部命令边界。
- [x] 将 `docs/wireframes/pages/observer.md` 必要内容并入 `docs/wireframes/pages/console.md`，并删除 `observer.md`。
- [x] 同步 `docs/wireframes/flow.md`，让本地操作台/诊断流程替代 observer 主事实源引用。
- [x] 运行 `rg` 迁移检查与 `pnpm test`，确认事实源归位且不引入 runner 核心语义变更。
