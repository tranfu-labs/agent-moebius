# github-issue-runner spec delta

## 新增
- SHOULD 允许里程碑 spike 使用 dev worktree 内的本地临时服务与无头浏览器截图，验证既有 output artifact publisher 是否足以支撑运行级验收。
- MUST 让该 spike 通过最终 agent 回复引用本地生成的截图文件路径来触发 runner 现有 output artifact publisher，而不是在 spike 脚本中手动调用 GitHub release 上传或复用 `src/github.ts`。
- MUST NOT 为该 spike 修改 `src/` 运行时代码、现有测试或 runner artifact 发布路径。
- MUST 让该 spike 只生成验收所需的 1 张 PNG 截图，避免在采访、方案或普通汇报阶段生成探索性图像 artifact。
- MUST 让该 spike 的本地 HTTP server ready、Chromium launch、page goto、页面 ready、页面稳定等待和 screenshot 全部有显式 timeout。
- MUST 让该 spike 在失败路径非 0 退出，并向 stderr 输出 timeout / 页面打开失败等阶段原因。
- MUST 让该 spike 使用 `try/finally` 在成功和失败路径都清理 Playwright browser 与本地 HTTP server。
- MUST 提供故障注入命令，用于验证页面无法 ready 时会在规定 timeout 内非 0 退出、stderr 说明原因并完成清理。
- MUST 让该 spike 的文档写明截图 artifact 证据位置，MUST NOT 只留下无解释的空占位。
- MUST 记录该 spike 的 artifact publisher finding：在不改 `src/`、不手动调用 `gh release upload` 的边界下，runner 未在本 issue 的 `code-verified` 评论中追加 `生成产物` 区或 `moebius-artifacts` release 链接；该 finding 指向后续 runner artifact discovery / 引用契约小改动，而不是立即建设 PR 预览基建。

## 场景
### 场景：预览 oracle spike — 通过现有 artifact publisher 发布截图证据
Given dev 在 issue worktree 内运行预览 oracle spike
And spike 脚本生成 1 张 PNG 截图
When dev 的 `code-verified` 回复显式引用该 PNG 路径
Then runner 在发布 agent comment 前发现该截图 artifact
And runner 通过同仓库 release tag `moebius-artifacts` 发布该截图
And runner 将截图 Markdown 追加到本 issue 评论
And spike 脚本本身不调用 `gh release upload` 或 `src/github.ts`

### 场景：预览 oracle spike — 记录 artifact publisher 未闭环 finding
Given dev 已在 `code-verified` 回复中引用 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`
And spike 脚本没有手动调用 `gh release upload`
When product-manager 检查本 issue 评论与 `moebius-artifacts` release assets
Then 本 spike 记录当前 runner 未追加截图 artifact 链接
And 结论文档必须把该结果列为未跑通环节
And 下一步建议应优先修 runner artifact discovery / 引用契约，而不是直接建设 PR 预览基建

### 场景：预览 oracle spike — 有界失败并清理本地资源
Given dev 在 issue worktree 内运行 `SPIKE_PREVIEW_ORACLE_READY_SELECTOR='[data-never-ready]' node scripts/spike-preview-oracle/run.mjs`
When 预览页面无法出现 ready selector
Then spike 脚本必须在 `PAGE_READY_TIMEOUT_MS` 附近退出非 0
And stderr 必须说明 `ready failed` / timeout 或页面无法稳定
And Playwright browser 与本地 HTTP server 必须被清理

### 场景：预览 oracle spike — 防止额外媒体产物
Given dev 已运行 `node scripts/spike-preview-oracle/run.mjs`
When 执行 `find scripts/spike-preview-oracle -type f \( -name '*.svg' -o -name '*.gif' -o -name '*.png' \)`
Then 输出必须只有 `scripts/spike-preview-oracle/artifacts/spike-preview-oracle.png`
And 不得出现额外 SVG / GIF / PNG 媒体文件
