# 提案：target-codex-reaction-to-trigger-message

## 背景
当前 Codex execution reaction 只会给 GitHub issue 本体添加 `eyes`。这能覆盖 issue body 首次触发 Codex 的场景，但对后续 comment 再次 `@dev` / `@product-manager` 触发 Codex 的对话型用法不够准确：用户看到的即时反馈停留在 issue 顶部，而不是这次真正被 runner 响应的最新 comment 上。

runner 已经只用共享时间线的最新消息作为触发源，因此 reaction 的目标也应该跟随同一个触发源。否则每一次后续 Codex driver 执行都会把反馈打到旧的 issue body 上，无法表达“我正在处理这条最新 comment”。

## 提案
把 Codex execution reaction 的目标从固定 GitHub issue 改为“本轮触发 Codex 的最新消息”：

- 最新触发源是 issue body 时，保持现有行为，给 issue 添加 `eyes` reaction。
- 最新触发源是 comment 时，给该 comment 添加 `eyes` reaction。
- 仍然只在真实 Codex driver 执行路径添加 reaction：mention trigger 命中、prompt plan 需要执行、preScript 成功之后、首次 `runCodex` 之前。
- 同一 issue 处理周期仍最多添加一次 reaction；resume 失败后的 fallback full run 不重复添加。
- reaction 添加失败仍只记录日志并继续执行 Codex，不改变 role thread 或评论发布的成功条件。

## 影响
- `github-client` 需要支持 issue body 与 issue comment 两类 reaction target；comment reaction 使用 GitHub comment node id 调用 GraphQL `addReaction`，避免解析评论 URL。
- `github-issue-runner` 在构造 timeline 和 prompt plan 后，根据最新消息 index 解析 reaction target，并把目标传给 GitHub adapter。
- `GitHubIssue.comments` shape 需要保留 comment `id`，用于 comment reaction。
- 单元测试需要覆盖 issue body target、latest comment target、GraphQL 参数构造、reaction 失败 fail-open 与非 Codex 路径不添加 reaction。
