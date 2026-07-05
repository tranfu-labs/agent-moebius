# spec-delta：github-issue-runner（acceptance-join-resilience）

## 修改「T4 acceptance route and integration acceptance point」规则

新增规则（追加到该节规则列表）：

- MUST log a visible event and post one bounded CEO format reminder (mentioning the reviewer role, capped at 2 reminders per issue via a hidden reminder marker) when an acceptance reviewer comment states an overall pass conclusion but the per-statement walkthrough cannot be parsed; beyond the cap the runner MUST log and fall through without posting.
- MUST verify the GitHub state of `missing` pending child issues when the integration join evaluates to waiting; when any missing child issue is closed, the runner MUST post one blocked report on the parent issue (deduped by hidden integration-blocked key) instead of waiting silently, and MUST fail open (keep waiting, log only) when the state query fails.
- MUST accept relaxed walkthrough statement-line prefixes: optional list bullet, optional table pipe, optional `原验收` / `正式验收` / `验收` / `验收语句` prefix before the statement number.

新增场景（追加到该节场景之后）：

### 场景 T4.9：整体通过结论但走查不可解析时发格式提醒
Given an acceptance reviewer comment states an overall pass conclusion
And the per-statement walkthrough cannot be parsed against the child task acceptance statements
When the acceptance pre-pass runs
Then an `acceptance-walkthrough-unparsed` event is logged
And one CEO comment is posted mentioning the reviewer role with the canonical walkthrough format
And the comment carries a hidden acceptance-format-reminder marker

### 场景 T4.9a：格式提醒每 issue 封顶两次
Given the issue timeline already contains two acceptance-format-reminder comments
And another unparsable overall-pass reviewer comment arrives
When the acceptance pre-pass runs
Then no further reminder comment is posted
And the event is logged with a cap reason
And processing falls through to normal trigger handling

### 场景 T4.10：missing 子 issue 已 closed 时上报 blocked
Given the integration join evaluates to waiting
And a pending child with reason missing is a closed GitHub issue
When the acceptance pre-pass processes a child acceptance comment
Then the parent issue receives one blocked report listing the closed child issues
And the report is deduped by a hidden integration-blocked key on repeat evaluations

### 场景 T4.10a：子 issue 状态查询失败 fail-open
Given the integration join evaluates to waiting
And the GitHub state query for a missing child issue fails
When the acceptance pre-pass processes a child acceptance comment
Then the runner keeps the waiting behavior and logs a fail-open event
And no blocked report is posted

### 场景 T4.11：放宽的走查行前缀可解析
Given a reviewer walkthrough uses lines like `- 原验收 1 通过：…` or `| 2 | 通过 |` or `验收 3：通过`
And the comment states an overall pass conclusion
When the acceptance pre-pass parses the walkthrough
Then each statement line is recognized and the passed acceptance fact is recorded

## 新增「T11 agent-authored no-mention fallback route」节

- MUST extend the no-mention fallback route to agent-authored latest comments on active issues that resolve to a goal-ledger child task.
- MUST keep the existing user-authored fallback route behavior unchanged.
- MUST record a deterministic `no_action` route (reason `ledger-task-closed`, no codex call) when the ledger already holds a passed acceptance fact for that child issue.
- MUST invoke the CEO fallback route judgment with ledger task context when the child task is not closed, and publish `append` results with exactly one legal mention under the existing route semantics.
- MUST dedupe agent-authored route decisions by comment id via the existing fallback route ledger, and keep fail-open semantics unchanged.
- MUST NOT trigger the agent-authored branch for issues that do not resolve to a ledger child task.

### 场景 T11.1：agent 无 mention 且任务未闭环时 CEO 兜底补路由
Given the latest comment on an active ledger child issue is agent-authored and contains no legal mention
And the ledger holds no passed acceptance fact for that child issue
When the fallback route runs
Then the CEO route judgment is invoked with ledger task context
And an append decision publishes one CEO comment containing exactly one legal mention

### 场景 T11.2：任务已闭环时确定性 no_action
Given the latest comment on an active ledger child issue is agent-authored and contains no legal mention
And the ledger holds a passed acceptance fact for that child issue
When the fallback route runs
Then a `no_action` route decision with reason `ledger-task-closed` is recorded without any codex call

### 场景 T11.3：同 comment id 不重复判定
Given an agent-authored comment id already has a fallback route decision recorded
When the same comment is reprocessed
Then no route judgment runs again and no comment is posted

### 场景 T11.4：非编排 issue 的 agent 评论不触发
Given the latest comment is agent-authored with no legal mention
And the issue does not resolve to any goal-ledger child task
When the fallback route runs
Then the agent-authored branch does not trigger and the skip behavior matches the current runner
