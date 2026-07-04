# 提案：artifact-run-manifest-t3

## 背景
T4 spike 已定位到一个稳定性缺口：dev 在 issue 独占 worktree 中生成的验收截图，即使在最终回复中按约定引用，也可能无法被现有 `discoverOutputArtifacts` 稳定发现并发布为 GitHub 评论可查看链接。当前输出 artifact 基线已支持扫描本轮生成媒体和发布到 release asset，但缺少专门面向“验收证据截图”的显式引用契约与稳定测试。

同时，每轮 Codex run 的结构化执行记录只分散在日志、role thread state 与临时 runDir 中。T4 观察页和里程碑 3 目标账本需要一个稳定、append-only 的 run manifest 契约，记录 issue、role、stage、产物路径、发布链接和时间。

## 提案
在 T3 范围内补齐两条最小契约：

1. 输出 artifact discovery 优先解析 dev 最终回复中显式引用的 worktree 相对路径。被引用且通过既有 artifact 校验的 PNG / SVG / 图片 / 视频会复制到本轮 `runDir/output-artifacts/`，再交给现有 artifact publisher 发布；未被引用的 worktree 文件不主动发布，mtime 扫描只作为既有兼容兜底。
2. runner 在每轮 Codex run 收尾时写入 run manifest：主契约源为 `.state/run-manifests.jsonl`，每条记录包含 issue、role、stage、artifact path / publishedUrl、startedAt、completedAt。runDir 可写一份排障副本，但不作为观察页契约源。artifact 已 staging 但发布失败时仍记录 staged path，`publishedUrl` 为 `null`。
3. 把验收截图引用契约写入 `docs/protocols/github-interaction.md` 与 `agents/dev.md`：截图放在 issue worktree 内，最终回复的「验收证据」中用相对路径引用；只有显式引用且通过校验的文件会发布。

## 影响
- `src/media-assets.ts`：收窄并稳定显式引用的 worktree 相对路径 discovery，补路径越界拒绝、未引用不发布与复制到 `output-artifacts/` 的测试。
- `src/runner.ts`：在 artifact 发布路径上收集发布链接并写入 `.state/run-manifests.jsonl`；manifest 写入失败不得伪装成功，按既有处理失败语义收敛。
- `src/codex.ts`：仅当实现需要补充 run timing / stage metadata 传递时最小触碰；默认不改。
- `agents/dev.md` 与 `docs/protocols/github-interaction.md`：新增验收截图引用契约。
- `tests/media-assets.test.ts` 与 `tests/runner.test.ts`：覆盖 T3 三条验收语句。
