# 任务：artifact-run-manifest-t3

- [x] 在 `src/media-assets.ts` 中稳定解析最终回复显式引用的 worktree 相对产物路径，并拒绝越界、绝对路径逃逸和不支持类型。
- [x] 补 `tests/media-assets.test.ts`：worktree 内 `artifacts/acceptance/t3.png` 被引用时进入 `output-artifacts/`；未引用 PNG 不主动发布；越界引用被拒绝。
- [x] 在 `src/runner.ts` 中收集 run started/completed 时间、原始 stage、artifact 输出路径与 publisher URL，并追加写入 `.state/run-manifests.jsonl`。
- [x] 补 `tests/runner.test.ts`：artifact 发布成功时评论体含链接且 manifest artifact 字段齐全；无产物时 manifest `artifacts` 为 `[]`。
- [x] 补 `tests/runner.test.ts`：成功发布路径中 manifest 主源写入失败时，只记录日志，不阻断 agent 评论发布，也不阻断 role thread 更新。
- [x] 补 `tests/runner.test.ts`：artifact publisher 抛错时仍写 manifest，staged artifact path 存在且 `publishedUrl` 为 `null`；若此时 manifest writer 也失败，仍发布 artifact 错误评论且不更新 role thread。
- [x] 补 `tests/runner.test.ts`：原始 final response stage 为 `code-verified` 时，即使 artifact markdown 后追加且 CEO guardrail 随后处理，manifest `stage` 仍为原始 `code-verified`；原始 marker 缺失或非法时，manifest `stage` 为 `unknown`。
- [x] 更新 `docs/protocols/github-interaction.md` 的验收截图引用契约。
- [x] 更新 `agents/dev.md` 的验收证据截图放置与引用要求。
- [x] 运行 `pnpm test` 与 `pnpm typecheck`。
