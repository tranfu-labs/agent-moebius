# 任务：spike-preview-oracle

- [x] 增加 Playwright devDependency，并更新 lockfile。
- [x] 新增 `scripts/spike-preview-oracle/run.mjs`，生成静态 HTML、启动本地 HTTP 服务并截取唯一 PNG。
- [x] 在脚本中定义并使用 `SERVER_READY_TIMEOUT_MS`、`BROWSER_LAUNCH_TIMEOUT_MS`、`PAGE_GOTO_TIMEOUT_MS`、`PAGE_READY_TIMEOUT_MS`、`PAGE_STABLE_TIMEOUT_MS`、`SCREENSHOT_TIMEOUT_MS` 与 `SPIKE_PREVIEW_ORACLE_READY_SELECTOR`。
- [x] 在脚本失败路径中使用 `try/finally` 清理 browser 与 HTTP server；失败时退出非 0，并向 stderr 输出 timeout / 打开失败等阶段原因。
- [x] 增加故障注入命令 `SPIKE_PREVIEW_ORACLE_READY_SELECTOR='[data-never-ready]' node scripts/spike-preview-oracle/run.mjs`，用于验证 ready timeout、非 0 退出、stderr 说明与清理。
- [x] 新增唯一媒体产物检查：`find scripts/spike-preview-oracle -type f \( -name '*.svg' -o -name '*.gif' -o -name '*.png' \)` 只允许输出 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`。
- [x] 新增 `docs/roadmap/spike-preview-oracle.md`，写明跑通/未跑通环节、artifact 证据位置与明确路径建议；不得只留下无解释的截图链接占位。
- [x] 运行探针脚本并确认只生成 1 张 PNG 截图作为验收证据。
- [x] 运行故障注入命令并确认在 timeout 内非 0 退出、stderr 说明原因且无残留 Chromium / HTTP server 进程。
- [ ] 运行 `pnpm test` 与 `pnpm typecheck`。
- [ ] 记录 artifact publisher gap：在不改 `src/`、不手动 `gh release upload` 的边界下，runner 未在本 issue 评论中产出 `agent-moebius-artifacts` 截图链接；该项作为 spike finding，不阻断 T4 收尾。
- [ ] loop watcher 裁决 T4 acceptance 后，追记 `docs/roadmap/milestone-1-acceptance-loop.md` 的 T4 证据并勾选任务。
