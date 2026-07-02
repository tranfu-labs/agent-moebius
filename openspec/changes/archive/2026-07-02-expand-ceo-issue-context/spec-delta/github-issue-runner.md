# github-issue-runner spec delta

## 修改

- 更新既有规则「MUST 定义 `agents/ceo.md` 的输入契约字段：`originalRequest`、`latestResponse`、`agent`、`allowedStages`、`lastReflectorHook`；MUST NOT 把完整 issue timeline 传给 CEO。」为：

  MUST 定义 `agents/ceo.md` 的输入契约字段：`issueContext`、`latestResponse`、`agent`、`allowedStages`、`lastReflectorHook`。

  `issueContext` MUST 是完整公开 issue context，至少包含：
  - `issueUrl`: `https://github.com/<owner>/<repo>/issues/<number>`
  - `issueBody`: 当前 issue body 原文
  - `comments`: 当前 issue 的所有 comment body 原文，按 GitHub 返回顺序排列

  CEO prompt MUST 明确 `latestResponse` 是本轮唯一待发布的 agent 响应；`issueContext` 只用于理解用户全局流程、后续覆盖指令、反思 hook 历史和交付规范。

- 更新既有规则「MUST 让 CEO 调用以短上下文、无状态方式执行：每次 CEO 调用 MUST 新建 codex thread、NEVER 复用 dev thread、NEVER 复用上次 CEO thread。」为：

  MUST 让 CEO 调用以完整公开 issue context、无状态方式执行：每次 CEO 调用 MUST 新建 codex thread、NEVER 复用 dev thread、NEVER 复用上次 CEO thread。

## 新增

### CEO 完整公开 issue context

- MUST 由 `src/runner.ts` 基于当前 `IssueSource` 与已拉取的 `GitHubIssue` 组装 CEO `issueContext`；`src/format-ceo.ts` MUST NOT 自行调用 GitHub、读取 `.state/*` 或读取本地 intake state。
- MUST 保留 comment body 中的隐藏 metadata 原文，包括 `role`、`stage`、`stage-hook` 与 `ceo-corrected`，以便 CEO 判断 speaker、反思轮次和循环防护背景。
- MUST 继续向 CEO 传入最近一条 reflector hook body 作为 `lastReflectorHook`；完整 comments 不替代该稳定字段。
- MUST NOT 在本 change 中新增独立 token 统计状态文件或新持久化机制；CEO token 成本观察沿用现有 Codex stdout JSONL 与 runDir 输出。

## 新增场景

### 场景：CEO guardrail — CEO 读取完整公开 issue context

Given 最新消息包含 `@dev`
And issue body 为 `全局流程：先采访再方案`
And comments 依次包含 `临时修改：本次不需要额外 token 统计` 与一条 `reflector` stage-hook metadata 评论
When runner 在 `postComment` 之前调用 CEO guardrail
Then `formatCeoComment` 的输入包含 `issueContext.issueUrl = "https://github.com/<owner>/<repo>/issues/<number>"`
And `issueContext.issueBody = "全局流程：先采访再方案"`
And `issueContext.comments` 按原顺序包含两条 comment body 原文
And `lastReflectorHook` 仍为最近一条 reflector hook body

### 场景：CEO prompt — latestResponse 仍是唯一待发布对象

Given CEO prompt 包含完整公开 issue context
And `latestResponse` 为当前 Codex agent 本轮输出
When CEO 判断是否需要 `no_change`、`replace` 或 `append`
Then CEO MUST 只校正或追加围绕 `latestResponse` 的发布行为
And issueContext 中的历史 agent 评论 MUST 只作为背景，不得被当成本轮待发布正文直接改写。
