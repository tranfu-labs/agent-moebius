# github-issue-runner spec delta

## 修改

- MUST 在 mention trigger 选中可运行 agent、prompt plan 需要执行、且该 agent 的 preScript 已成功完成后，在首次调用 Codex driver 前，为本轮触发 Codex 的最新消息添加 `eyes` reaction。
- MUST 当触发源是 issue body 时，为当前 GitHub issue 添加 `eyes` reaction。
- MUST 当触发源是 issue comment 时，为该 GitHub issue comment 添加 `eyes` reaction，而不是 fallback 到 issue body。
- MUST 通过 GitHub adapter 使用受控 target 与 argv 参数数组添加 reaction：issue body reaction MAY 使用 REST issue reactions endpoint；issue comment reaction MUST 使用 GitHub comment node id 调用 GraphQL `addReaction`。
- MUST 在拉取 issue body/comments 时保留每条 comment 的 GitHub node `id`，用于 comment reaction target。
- MUST 仅在真实 Codex driver 执行路径添加该 reaction；no-trigger、deterministic stage hook、preScript 失败、prompt plan skip、Codex 不会启动的路径 MUST NOT 添加该 reaction。
- MUST 在同一个 issue 处理周期中最多添加一次 Codex execution reaction；resume 失败后 fallback full run MUST NOT 再添加第二次 reaction。
- MUST 在 Codex execution reaction 添加成功时记录结构化日志，至少包含 `event = "codex-execution-reaction-added"`、`issueKey`、`agent`、`targetSource` 与 `targetIndex`。
- MUST 在 Codex execution reaction 添加失败时记录结构化日志，至少包含 `event = "codex-execution-reaction-failed"`、`issueKey`、`agent`、`targetSource`、`targetIndex` 与错误原因，并继续执行 Codex；reaction 失败本身 MUST NOT 推进或阻断 role thread 状态。

## 新增场景

### 场景：Codex 执行反馈 — issue body 触发时 reaction 到 issue
Given issue body 包含 `@dev`
And 当前 issue 没有 comments
And `agents/dev.md` 存在
And prompt plan 需要执行 Codex
When runner 即将调用 `runCodex`
Then 系统先为当前 GitHub issue 添加 `eyes` reaction
And 日志中的 `targetSource = "issue-body"`、`targetIndex = 0`
And 随后调用 Codex driver

### 场景：Codex 执行反馈 — 最新 comment 触发时 reaction 到该 comment
Given issue body 不包含有效 trigger
And 最新 comment body 包含 `@dev`
And 该 comment 带有 GitHub node `id`
And `agents/dev.md` 存在
And prompt plan 需要执行 Codex
When runner 即将调用 `runCodex`
Then 系统先为最新 comment 添加 `eyes` reaction
And 不为 issue body 添加本轮 Codex execution reaction
And 日志中的 `targetSource = "comment"`、`targetIndex` 等于该 comment 在共享时间线中的 index
And 随后调用 Codex driver

### 场景：Codex 执行反馈 — comment reaction 失败不阻断 Codex
Given runner 即将为最新 comment 添加 `eyes` reaction
And GitHub comment reaction API 调用失败
When runner 处理该失败
Then 系统记录 `event = "codex-execution-reaction-failed"` 与错误原因
And 继续调用 Codex driver
And role thread 状态仍只在 Codex 成功且最终 GitHub 评论成功后更新

## 可验证行为

`pnpm test` MUST 在原有覆盖基础上增加：

- `buildAddReactionArgs` 为 issue target 构造安全的 `gh api --method POST repos/<owner>/<repo>/issues/<number>/reactions -f content=eyes` 参数数组。
- `buildAddReactionArgs` 为 issue comment target 构造安全的 `gh api graphql ... addReaction ... subjectId=<comment-id> ... content=EYES` 参数数组。
- runner 在 issue body mention-trigger Codex 路径中，于首次 `runCodex` 前调用 issue target reaction。
- runner 在 latest comment mention-trigger Codex 路径中，于首次 `runCodex` 前调用 comment target reaction。
- runner 在 stage hook、no-trigger、preScript 失败和 prompt plan skip 路径不调用 reaction adapter。
- runner 在 reaction 添加失败时仍调用 Codex，并保持状态推进条件不变。
