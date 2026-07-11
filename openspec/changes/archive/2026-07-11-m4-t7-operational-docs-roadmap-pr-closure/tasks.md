# 任务：m4-t7-operational-docs-roadmap-pr-closure

- [x] 写入 #131 收尾方案，明确实现、commit、push、PR 必须等待 #129 与 #130 merge。
- [x] 写入最小 `local-console` delta，记录长期有效的运营启动文档契约。
- [x] 等待 #129 merge，并确认 GitHub-mode flag 为 `--github-mode`、用法为 `pnpm start -- --github-mode`。
- [x] 等待 #130 merge，并确认 spec/wireframes 事实源迁移后的真实文件状态。
- [x] 基于 merge 后事实更新 `AGENTS.md` 启动形态章节，显眼列出默认 local、`--github-mode`、`pnpm start -- --github-mode`、纯 GitHub 行为与两模式数据互不可见。
- [x] 更新 `docs/roadmap/milestone-4-local-console.md`，把 T7 勾选为 `[x]` 并追记默认 local、flag GitHub、两模式隔离、测试全绿和 `AGENTS.md` diff 等验收证据。
- [x] 跑文档检查、focused startup/state/desktop tests、`pnpm test`、`pnpm typecheck`、OpenSpec strict validation 与 `git diff --check`。
