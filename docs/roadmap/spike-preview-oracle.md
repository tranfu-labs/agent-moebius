# 预览 oracle spike 结论

## 明确建议
里程碑 1 的运行级验收默认优先采用本地 worktree 起服务、无头浏览器截图、runner artifact publisher 的轻量链路，但当前结论是**部分覆盖**：worktree 本地服务、Playwright 截图、唯一 PNG 与故障注入已经跑通；runner artifact publisher 没有在本 issue 评论中产出 release 链接，说明现有发布链路还需要小改动才能闭环。

建议下一步优先修 runner artifact publisher 的小 gap：明确 worktree-local screenshot 的引用契约，并让输出 artifact discovery 能稳定发现 dev worktree 内生成的验收截图。PR 预览基建暂不作为里程碑 1 的前置投入；只有当验收对象需要公网回调、跨设备协作、第三方 OAuth、真实域名 / CORS、长期共享预览或类似外部可访问能力时，再把 PR 预览放入后续里程碑候选。

## 本次验证对象
本 spike 使用 `docs/roadmap/milestone-1-acceptance-loop.md` 生成本地静态 HTML，由 `scripts/spike-preview-oracle/run.mjs` 启动 `127.0.0.1` 临时 HTTP 服务，并用 Playwright Chromium 截取 1 张 PNG。

本次不验证真实前端业务功能，不建设通用预览平台，不修改 `src/` 运行时代码，不手动调用 `gh release upload`，也不 import `src/github.ts`。

## 已跑通环节
- worktree 内生成静态 HTML。
- worktree 内启动本地临时 HTTP 服务。
- Playwright 打开本地 URL 并截图。
- 唯一媒体产物检查：`scripts/spike-preview-oracle/` 下只生成 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`。
- 故障注入：`SPIKE_PREVIEW_ORACLE_READY_SELECTOR='[data-never-ready]' node scripts/spike-preview-oracle/run.mjs` 在 timeout 内非 0 退出，stderr 包含 `ready failed` 与 Playwright timeout 信息，且无残留 Chromium / HTTP server 进程。

## 未覆盖环节
- runner artifact publisher 未在本 issue 的 `code-verified` 评论中追加 `生成产物` 区或 `agent-moebius-artifacts` release 链接；release assets 中也未出现 `spike-preview-oracle` 相关资产。该 gap 在不改 `src/`、不手动 `gh release upload` 的边界下无法由 spike 脚本自行闭环。
- 公网 webhook / callback。
- 跨设备或多人同时访问同一预览。
- 第三方 OAuth 回跳。
- 真实域名、HTTPS、CORS 与 cookie 域策略。
- 长期在线共享预览。

这些场景是 PR 预览基建的候选触发条件，不是本 spike 的实现范围。

## Artifact 证据位置
预期证据位置是本 issue 的 dev `code-verified` 评论中由 runner 自动追加的 `生成产物` 区域；实际验证中该区域未出现，`agent-moebius-artifacts` release 也没有生成对应资产。

本地截图路径：`scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`。

## 下一步基建判断
- 优先补 runner artifact publisher：让 dev worktree 内的验收截图在 `code-verified` 回复引用后能稳定发布，或把引用格式收窄为明确的 markdown image contract 并在 persona / 文档中写清。
- 不因为本 spike 的 artifact publisher gap 直接上 PR 预览基建。PR 预览只针对公网回调、跨设备协作、OAuth、真实域名 / CORS、长期共享预览等本地 worktree 无法代表的场景。
