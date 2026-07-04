# 设计：spike-preview-oracle

## 方案
探针实现为一个局部 Node 脚本，不引入运行时模块依赖：

1. `scripts/spike-preview-oracle/run.mjs` 读取 `docs/roadmap/milestone-1-acceptance-loop.md`，将内容转成一个简单静态 HTML 文件，输出到 `scripts/spike-preview-oracle/dist/preview.html`。
2. 同一脚本使用 Node `http` 在 `127.0.0.1` 上启动临时静态服务，端口使用系统分配的空闲端口，避免固定端口冲突。
3. 脚本定义并使用这些显式 timeout 常量：
   - `SERVER_READY_TIMEOUT_MS = 5_000`
   - `BROWSER_LAUNCH_TIMEOUT_MS = 15_000`
   - `PAGE_GOTO_TIMEOUT_MS = 10_000`
   - `PAGE_READY_TIMEOUT_MS = 5_000`
   - `PAGE_STABLE_TIMEOUT_MS = 10_000`
   - `SCREENSHOT_TIMEOUT_MS = 10_000`
   - `SPIKE_PREVIEW_ORACLE_READY_SELECTOR = "[data-spike-preview-ready=\"true\"]"`
4. 脚本用 Playwright Chromium 打开本地 URL，按上述 timeout 等待 `SPIKE_PREVIEW_ORACLE_READY_SELECTOR` 与页面稳定，然后保存唯一截图 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`。
5. 脚本主流程使用 `try/finally`：无论成功、timeout、页面打开失败还是截图失败，都必须尝试关闭 browser 与 HTTP server；失败路径必须设置非 0 退出码，并向 stderr 输出带阶段名的错误原因。
6. 脚本提供故障注入命令 `SPIKE_PREVIEW_ORACLE_READY_SELECTOR='[data-never-ready]' node scripts/spike-preview-oracle/run.mjs`，通过覆盖 ready selector 验证页面无法 ready 时会在 `PAGE_READY_TIMEOUT_MS` 内非 0 退出、stderr 说明 `ready failed` / timeout，并完成 browser/server 清理。
7. 脚本每次运行前清理 `scripts/spike-preview-oracle/dist/` 与 `scripts/spike-preview-oracle/artifacts/`，运行后检查 `scripts/spike-preview-oracle/` 下的媒体文件集合；允许的唯一媒体文件是 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`。
8. `docs/roadmap/spike-preview-oracle.md` 写明：
   - 本地 HTML 生成、临时服务、无头截图、runner artifact 发布各环节的验证方式。
   - 已跑通环节与未覆盖环节。
   - 截图 artifact 证据位置：本 issue 的 dev `code-verified` 评论中由 runner 自动追加的 `生成产物` 区域，而不是空白占位。
   - 明确建议：大多数可本地启动的验收默认走 worktree 本地服务 + 截图 + artifact；PR 预览只作为公网回调、跨设备协作、第三方 OAuth、真实域名/CORS、长期共享预览等场景的后续候选基建。

实现阶段只在最终 `code-verified` 回复中引用截图文件路径，触发 runner 现有 output artifact publisher。脚本本身不发布 release asset，也不依赖 GitHub CLI。

## 测试与验证
- 运行 `pnpm install` 或等价安装流程，确保新增 devDependency 写入 lockfile。
- 运行 `pnpm exec playwright install chromium`，为本地截图准备 Chromium。
- 运行 `node scripts/spike-preview-oracle/run.mjs`，应在有界时间内退出 0，生成 `preview.html` 与唯一 PNG 截图。
- 运行 `find scripts/spike-preview-oracle -type f \( -name '*.svg' -o -name '*.gif' -o -name '*.png' \)`，应只输出 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`。
- 运行 `SPIKE_PREVIEW_ORACLE_READY_SELECTOR='[data-never-ready]' node scripts/spike-preview-oracle/run.mjs`，应在 `PAGE_READY_TIMEOUT_MS` 附近非 0 退出，stderr 说明 `ready failed` / timeout，并无残留 Chromium / HTTP server 进程。
- 运行 `pnpm test` 与 `pnpm typecheck`，确认没有破坏现有项目。
- 在 `code-verified` 回复中引用 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`，由 runner 追加 artifact 预览作为验收语句 2 的证据。

## 权衡
- 选择 Playwright 而不是 Puppeteer：Playwright API 对截图和本地页面等待更直接，且符合需求允许的 devDependency 范围。
- 选择脚本内临时 HTTP 服务而不是新增 `package.json` script：避免把 spike 命令提升为长期项目接口，保持一次性探针属性。
- 选择简单 HTML 渲染而不是完整 Markdown 渲染库：本任务验证的是本地服务、截图和 artifact 链路，不验证 Markdown 渲染保真度；少引入一个运行外依赖更符合范围最小。
- 选择 runner 自动 artifact 发布而不是脚本手动上传：这更贴近任务要验证的真实链路，也避免把 GitHub release 发布逻辑复制到 spike 脚本。

## 风险
- Playwright 浏览器二进制可能未安装。缓解方式是在 stderr 错误与验证步骤中明确 `pnpm exec playwright install chromium`。
- runner 只有在最终回复引用截图路径或截图文件足够新时才会发现 artifact。缓解方式是在 `code-verified` 正文显式引用 PNG 路径。
- 本地 worktree 服务无法覆盖需要公网域名、第三方 OAuth、外部 webhook、跨设备共享或长期在线预览的验收场景。结论文档会把这些列为 PR 预览基建候选触发条件。
- 若截图发布失败，runner 现有规则会发布 artifact 错误评论并不更新 role thread；本次实现不绕过该失败路径。
