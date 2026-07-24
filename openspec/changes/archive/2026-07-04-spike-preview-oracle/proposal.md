# 提案：spike-preview-oracle

## 背景
里程碑 1 的 T4 需要回答一个基建取舍问题：运行级验收默认走 dev worktree 本地起服务、无头浏览器截图和现有 output artifact publisher 是否足够，还是必须提前建设 PR 预览环境。

上一轮 #38 曾因为探索性图表被 runner 当作输入媒体传给后续 agent，导致 Codex 失败并阻塞回流。本次 spike 必须保持范围最小，只生成验收语句要求的 1 张 PNG 截图，并在 `code-verified` 阶段通过 runner 现有 artifact publisher 发布。

## 提案
新增一个最小探针与结论文档：

- 在 `scripts/spike-preview-oracle/` 放置一次性 spike 脚本，读取 `docs/roadmap/milestone-1-acceptance-loop.md`，生成本地静态 HTML，启动本地 HTTP 服务，并用 Playwright/Chromium 截取 1 张 PNG。
- 在 `package.json` / `pnpm-lock.yaml` 增加 Playwright 作为 devDependency，供本地无头浏览器截图使用。
- 脚本必须为本地 HTTP server ready、Chromium launch、page goto、页面 ready、页面稳定等待、screenshot 设置显式 timeout；失败时必须非 0 退出，在 stderr 说明 timeout / 打开失败等原因，并通过 `try/finally` 清理 browser 与 HTTP server。
- 脚本提供故障注入命令，用于验证页面无法 ready 时会在 timeout 内失败并完成清理。
- 脚本完成后必须检查 `scripts/spike-preview-oracle/` 下只存在验收所需的 1 张 PNG 媒体产物，避免重复 #38 的媒体放大事故。
- 新增 `docs/roadmap/spike-preview-oracle.md`，记录跑通和未覆盖环节，写明截图 artifact 的证据位置，并给出明确建议：默认优先本地 worktree 起服务 + 截图 + artifact；只有遇到公网回调、跨设备协作、第三方 OAuth、真实域名/CORS、长期共享预览等场景，才把 PR 预览基建放入后续里程碑候选。
- 实现验证通过后，在 `code-verified` 回复中明确引用生成的 PNG 路径，让 runner 自动发布到 `moebius-artifacts` release；探针脚本不手动调用 `gh release upload`，也不 import `src/github.ts`。

## 影响
- 影响 `scripts/spike-preview-oracle/`、`docs/roadmap/spike-preview-oracle.md`、`package.json` 与 `pnpm-lock.yaml`。
- 验收通过后追记 `docs/roadmap/milestone-1-acceptance-loop.md` 的 T4 证据并勾选任务。
- 不修改 `src/` 运行时代码，不修改现有测试，不新增通用预览平台，不验证真实前端业务功能。
