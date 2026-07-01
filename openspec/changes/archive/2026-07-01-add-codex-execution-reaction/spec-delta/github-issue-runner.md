# github-issue-runner spec delta

## 新增

- MUST 在 mention trigger 选中可运行 agent、prompt plan 需要执行、且该 agent 的 preScript 已成功完成后，在首次调用 Codex driver 前为当前 GitHub issue 添加 `eyes` reaction。
- MUST 仅在真实 Codex driver 执行路径添加该 reaction；no-trigger、deterministic stage hook、preScript 失败、prompt plan skip、Codex 不会启动的路径 MUST NOT 添加该 reaction。
- MUST 在同一个 issue 处理周期中最多添加一次 Codex execution reaction；resume 失败后 fallback full run MUST NOT 再添加第二次 reaction。
- MUST 通过 GitHub adapter 使用 `gh api` 与 argv 参数数组添加 issue reaction，MUST NOT 通过 shell 拼接 issue 内容或命令。
- MUST 在 reaction 添加成功时记录结构化日志，至少包含 `event = "codex-execution-reaction-added"`、`issueKey` 与 `agent`。
- MUST 在 reaction 添加失败时记录结构化日志，至少包含 `event = "codex-execution-reaction-failed"`、`issueKey`、`agent` 与错误原因，并继续执行 Codex；reaction 失败本身 MUST NOT 推进或阻断 role thread 状态。

## 新增场景

### 场景 27：Codex 执行反馈 — 真正调用 Codex 前添加 eyes reaction
Given 最新消息包含 `@dev`
And `agents/dev.md` 存在
And dev preScript 成功
And prompt plan 需要执行 Codex
When runner 即将调用 `runCodex`
Then 系统先为当前 GitHub issue 添加 `eyes` reaction
And 日志包含 `event = "codex-execution-reaction-added"`、`issueKey` 与 `agent = "dev"`
And 随后调用 Codex driver

### 场景 28：Codex 执行反馈 — 非 Codex 执行路径不添加 reaction
Given 最新消息没有有效 mention，或最新消息触发 deterministic stage hook，或选中 agent 的 preScript 失败，或 resume prompt plan 因无新增外部消息跳过
When runner 处理该 issue
Then 系统不添加 `eyes` reaction
And 不把该 reaction 当作处理成功条件

### 场景 29：Codex 执行反馈 — resume fallback 不重复 reaction
Given runner 已在本轮 resume Codex 前添加过 `eyes` reaction
And `codex exec resume <threadId>` 失败
When runner fallback 到 full prompt 再调用 Codex
Then 系统不再添加第二次 `eyes` reaction

### 场景 30：Codex 执行反馈 — reaction 失败不阻断 Codex
Given runner 即将调用 Codex
And GitHub issue reaction API 调用失败
When runner 处理该失败
Then 系统记录 `event = "codex-execution-reaction-failed"` 与错误原因
And 继续调用 Codex driver
And role thread 状态仍只在 Codex 成功且最终 GitHub 评论成功后更新

## 可验证行为

`pnpm test` MUST 在原有覆盖基础上增加：

- `buildAddIssueReactionArgs` 为 `eyes` reaction 构造安全的 `gh api --method POST repos/<owner>/<repo>/issues/<number>/reactions -f content=eyes` 参数数组。
- runner 在 mention-trigger Codex 路径中，于首次 `runCodex` 前调用 `addIssueReaction(source, "eyes")`。
- runner 在 stage hook、no-trigger、preScript 失败和 prompt plan skip 路径不调用 `addIssueReaction`。
- runner 在 reaction 添加失败时仍调用 Codex，并保持状态推进条件不变。
