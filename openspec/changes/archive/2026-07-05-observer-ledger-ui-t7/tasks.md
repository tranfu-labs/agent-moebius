# 任务：observer-ledger-ui-t7

- [ ] 扩展 observer reader，只读读取 `.state/goal-ledger.json`，覆盖 missing、malformed、invalid schema 与合法账本诊断。
- [ ] 为 `.state/goal-ledger.json` 读取增加 observer 本地 timeout wrapper 和可注入 fake reader / fake FS 测试入口，覆盖 read 永不 settle 时的 timeout 诊断与 legacy fallback。
- [ ] 新增 ledger tree 纯模型，完成 watched repo 过滤、非白名单 ref 标注、goal/milestone/task 分组、phase 摘要、owner 级 multiple-active 错误和 task detail 映射。
- [ ] 实现 gate/evidence 映射：child acceptance、integration event、blocked/waiting reason、精确 roundtable child badge 与负例、explicit runManifestRefs 与 unlinked local runs。
- [ ] 更新 observer renderer，把主页面改为 ledger-first 树视图，并保留 legacy issue/run 二级区域与 ledger 损坏 fallback。
- [ ] 为 observer 增加 fixture 级 Vitest 覆盖：树、未归属任务、phase、watchlist 过滤、非白名单 ref、acceptance/join/gate、read timeout、owner 级 multiple-active、roundtable 正负例、run refs、unlinked runs、坏 ledger fallback。
- [ ] 复跑只读边界测试：fixture 文件哈希不变、fake `gh` / `codex` 零调用、无 observer 写路径。
- [ ] 更新 `AGENTS.md` observer 说明、`docs/architecture/module-map.md` observer 职责和 `docs/roadmap/milestone-3-orchestration.md` T7 验收证据。
- [ ] 运行 `pnpm vitest run tests/observer.test.ts --reporter=verbose`、`pnpm test`、`pnpm typecheck`、`git diff --check`。
