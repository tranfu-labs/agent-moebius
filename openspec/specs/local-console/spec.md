# local-console 规格

## 域定位

`local-console` 是默认本地对话操作台的数据通道。它复用 GitHub issue runner 已有的 conversation、mention trigger、agent persona 与 Codex driver 能力，但输入输出落在本机 HTTP API 与 `.state/local-console.sqlite`，供 Electron 操作台或本地浏览器客户端使用。

本域规定一个本地项目下多会话、运行直播、中断、卡住状态、本地错误记录、agent 接力位点、本地 no-mention 交棒总线、workspace diff 事实、T5 本地验收走查/验收回流切片，以及 dead-letter / recovery 可见收敛；不承载 T5 的完整 CEO 兜底、完整子会话编排、artifact publishing parity，也不承载 T6 的 GitHub/local 互斥启动 flag。

## 业务规则

### 持久化与兼容入口
- MUST keep local console state in the existing `.state/local-console.sqlite`; it must not create a second persistence file disconnected from the T2/T3 local channel.
- MUST preserve the default local session and the T2 compatibility message endpoint, mapping it to the default local session.
- MUST render local session timelines from `session_messages` without inventing GitHub issue concepts.
- MUST keep local session execution serial per session; a running session must not start a second concurrent Codex run.
- MUST release the session after Codex success, failure, timeout, or user interruption so later local messages can be processed.

### 桌面操作台数据通道
- MUST expose a local console state API that returns one local project, its sessions, the selected session timeline, global running/waiting/stuck/error counts, active run snapshot, and visible local errors.
- MUST support creating and selecting multiple local sessions under the single local project; session ids for new local sessions must be stable and persisted in SQLite.
- MUST expose session-scoped message submission and interrupt operations.
- MUST keep the local console API loopback-only by default.

### 运行直播
- MUST expose active Codex run state while a local session is running: run id, role when known, runDir, elapsed time, status, a recent stdout/stderr summary, and any tail-read diagnostic.
- MUST read live output from the current runDir stdout/stderr artifacts or an equivalent Codex output stream using a bounded byte window and a bounded read timeout.
- MUST NOT let a large, missing, locked, slow, or unparseable stdout/stderr file block the state API indefinitely.
- MUST show a non-empty live summary for every running local session; when structured JSONL cannot be parsed, the UI must fall back to raw tail text or a deterministic running summary.

### 中断与失败分流
- MUST provide an interrupt operation for the current local session run.
- MUST implement interruption by aborting the active Codex run through the existing Codex driver cancellation path or an equivalent bounded termination path.
- MUST require interrupt requests to target the active run by session id and run id; a request for another session or stale run id must not abort the active run.
- MUST persist user interruption distinctly from stuck state and error failure; interrupted local messages must be distinguishable from stuck and failed local messages in SQLite, API responses, and UI.
- MUST append a visible local system record when a run is interrupted by the user.
- MUST append a visible local error record when Codex fails by non-zero exit, spawn error, or other non-timeout driver failure.
- MUST NOT classify user interruption as an error failure.
- MUST allow a local session to accept a later message after an interrupted run.

### 卡住状态
- MUST represent stuck local runs as a distinct visible state in SQLite, API responses, and UI.
- MUST classify Codex idle timeout, max-duration timeout, and stale running repair as stuck unless a more specific non-user error is available.
- MUST append a visible local system record when a run becomes stuck, including reason and runDir when available.
- MUST preserve interrupted, failed, and stuck records across renderer refresh and desktop window restart.
- MUST NOT leave a session permanently running after timeout or stale running repair.

### Dead-letter 与重启恢复
- MUST keep a failure count and last failure reason for each local source message processing failure.
- MUST count failures by source session id and source message id, not by run id.
- MUST keep a failed source message retryable until the configured local failure retry limit is exhausted.
- MUST write exactly one visible local dead-letter system record when a source message exhausts the retry budget.
- MUST persist a matching `local_dead_letters` fact for the dead-lettered source message.
- MUST complete or otherwise terminally mark the dead-lettered source message so later polling does not replay the same source message.
- MUST NOT save a successful dead-letter outcome when the visible dead-letter system record cannot be written.
- MUST NOT advance the local processing cursor when the visible dead-letter system record cannot be written.
- MUST ensure visible dead-letter system records contain no legal agent mention and do not trigger another local agent run.
- MUST allow a later local message in the same session to continue processing after an earlier message has been dead-lettered.
- MUST apply the same retry budget to `recordAgentResponse` failures that happen before the agent response is durably committed.
- MUST NOT duplicate an agent response when `recordAgentResponse` fails before commit and the source message is retried until dead-letter.
- MUST migrate old SQLite databases or missing failure metadata to default failure metadata without losing pending or running message positions.
- MUST release or recover the session cursor after stuck recording so the session is not permanently running.
- MUST NOT duplicate an agent response that was already persisted before process restart.
- MUST continue startup catch-up from the next unprocessed local trigger after restart.

### 边界
- MUST keep GitHub runner semantics untouched while allowing the local acceptance-loop slice in this domain.
- MUST allow local acceptance-role walkthrough parsing, local acceptance fact recording, parent integration progress, repair routing, and visible format diagnostics in `.state/local-console.sqlite`.
- MUST NOT modify `conversation`, `triggers`, agent mention parsing, stage parsing, CEO guardrail, goal-ledger business rules, GitHub issue timeline normalization, GitHub issue intake scheduling, GitHub comment publication, reaction targets, release artifact publication, issue media handling, issue worktree behavior, observer behavior, GitHub driver pool semantics, or other GitHub issue runner semantics to satisfy local-console behavior.
- MUST NOT use the local acceptance-loop or dead-letter/recovery slices to implement unrelated T5 local equivalents such as full CEO no-mention fallback, full child session orchestration, artifact publishing parity, or unconfirmed cross-mode behavior.
- MUST NOT implement T6 GitHub/local mutually exclusive startup flag or cross-mode data migration in this domain.

### 本地验收走查解析
- MUST parse acceptance-role walkthrough messages that use one line per formal acceptance statement plus one final overall conclusion line.
- MUST accept `qa`, `product-manager`, and `hermes-user` as local acceptance roles for this pre-pass.
- MUST require each walkthrough item to be numbered from 1 through the number of formal acceptance statements without gaps.
- MUST require each walkthrough item to state either pass or fail and include evidence text.
- MUST require the overall `验收结论：通过/不通过` line to match the per-statement results.
- MUST NOT infer a pass fact from a summary-only acceptance message that lacks parseable per-statement walkthrough lines.
- MUST preserve enough acceptance history to audit a failed walkthrough followed by a later passing recheck.
- MUST use the latest valid acceptance fact for routing decisions when the same acceptance role rechecks after repair.

### 本地验收 pre-pass 回流
- MUST run acceptance pre-pass before normal mention trigger handling.
- MUST write local acceptance facts before consuming any handoff mention in the same acceptance message.
- MUST create or update parent integration progress after all in-scope local child session acceptance facts pass.
- MUST route acceptance failure into a repair path instead of treating the original implementation as accepted.
- MUST keep acceptance facts, integration events, repair references, visible system messages, and cursor advancement within an atomic local SQLite boundary.
- MUST NOT advance the local processing cursor as successfully handled when visible acceptance side effects fail to write.
- MUST NOT consume a handoff mention from the same acceptance message when acceptance pre-pass fails before required visible side effects are written.
- MUST dedupe parent integration progress and repair routing by stable local keys across retries.
- MUST surface a visible blocked or error state when formal acceptance statements cannot be found for an acceptance-role message.

### 本地验收格式诊断
- MUST produce a visible format reminder or error state when an acceptance-role message clearly attempts acceptance but cannot be parsed.
- MUST NOT save a passed acceptance fact for an unparseable walkthrough.
- MUST keep the original message retryable or visibly diagnosed when format handling fails.
- MUST ensure format reminders contain no legal agent mention and do not trigger an agent run by themselves.

## 场景

### 场景 LC.T4.1：桌面台发起对话后看到运行直播
Given the desktop operator console is open
And it shows the single local project with multiple sessions support
When the user creates or selects a local session
And sends a message that triggers a fake slow Codex run
Then the session timeline shows the user message
And it shows an in-progress run block
And the run block includes a non-empty live summary, elapsed time, and runDir
And the UI does not show a blank running state.

### 场景 LC.T4.2：运行中断后状态如实反映
Given a local session has an active fake slow Codex run
When the user clicks interrupt
Then the Codex run is aborted through the local runtime
And the original local message is persisted as interrupted rather than failed
And a visible system record states that the run was interrupted by the user
And the session is released for a later message.

### 场景 LC.T4.3：Codex 失败形成本地错误记录
Given a local session message triggers fake Codex
And fake Codex exits non-zero or fails to spawn
When the local runtime records the result
Then the original local message is persisted as failed
And the timeline shows a visible local error record with reason and runDir when available
And the error is present after refresh rather than only in process logs.

### 场景 LC.T4.4：多会话导航不并发污染
Given the local project has session A and session B
And session A is running
When the user switches to session B
Then session B timeline remains readable
And session A still appears as running in the sidebar
And session B cannot accidentally interrupt session A unless the interrupt targets session A's active session id and run id.

### 场景 LC.T4.5：结构化输出缺失时降级显示
Given a Codex run has a runDir but stdout.jsonl has no parseable assistant or progress event yet
When the desktop console renders the active run
Then it still displays a deterministic non-empty running summary
And it includes runDir or elapsed time as supporting evidence.

### 场景 LC.T4.6：尾流读取有界
Given a Codex run has a very large stdout.jsonl
Or reading stdout/stderr is slow or fails
When the desktop console polls local state
Then the state API returns within the configured bound
And the run block displays a recent tail summary or deterministic fallback
And the session remains interruptible.

### 场景 LC.T4.7：timeout 或 stale running 显示卡住
Given a local Codex run hits idle timeout, max-duration timeout, or stale running repair
When the local runtime records the result
Then the original message is persisted as stuck
And the timeline shows a visible stuck record with reason and runDir when available
And the session is released for a later message.

### 场景 LC.T4.8：刷新后状态仍可见
Given a local session contains interrupted, failed, and stuck records
When the renderer refreshes or the desktop window restarts
Then the records are restored from SQLite/API
And their status, reason, and runDir remain distinguishable.

### 场景 LC.T5.1：本地验收角色通过走查写入事实并驱动父级回流
Given a local child session has formal acceptance statements
When `product-manager`, `hermes-user`, or `qa` writes parseable numbered walkthrough lines and `验收结论：通过`
Then the local console records a passed local acceptance fact
And the evidence records statement-level results
And the parent session receives one deduped integration progress or request event.

### 场景 LC.T5.2：本地验收角色不通过走查创建回修路径
Given a local child session has formal acceptance statements
When an acceptance role writes one or more failed walkthrough lines and `验收结论：不通过`
Then the local console records a failed local acceptance fact
And a stable repair handoff or repair child session is created or recovered
And the parent session can see the repair reference.

### 场景 LC.T5.3：先失败后复验通过使用最新事实
Given an acceptance role first writes a parseable failed walkthrough
And a repair path is created or recovered
When the same acceptance role later writes a parseable passing walkthrough for the same task
Then the latest passed fact drives parent rejoin or integration progress
And the previous failed repair remains visible as a system record, repair reference, or historical acceptance fact.

### 场景 LC.T5.4：父级可见写失败可重试且不消费同消息 handoff
Given a local child acceptance fact is ready to trigger parent integration progress
And writing the visible parent progress fails
When local acceptance pre-pass settles
Then the triggering message cursor is not advanced
And any handoff mention in the same message is not consumed
And a completed parent integration request is not recorded
And a later retry creates only one deduped parent integration progress.

### 场景 LC.T5.5：验收格式错误产生可见提醒
Given a local child session has formal acceptance statements
When an acceptance role writes `验收结论：通过` without parseable numbered walkthrough lines
Then the local console writes a visible format reminder or error state
And no passed local acceptance fact is recorded
And the missing fact remains visible in local T5 facts or session status.

### 场景 LC.T5.6：格式错误同消息 handoff 不触发普通交棒
Given a local child session has formal acceptance statements
When an acceptance role writes malformed walkthrough lines and also includes a legal handoff mention
Then the local console writes a visible format reminder or error state
And no passed local acceptance fact is recorded
And the handoff mention in that same message is not consumed by normal trigger handling.

### 场景 LC.T5.7：缺 formal acceptance statements 时阻塞验收
Given a local child session has no readable formal acceptance statements
When an acceptance role writes an acceptance walkthrough
Then the local console writes a visible blocked or error state
And no passed acceptance fact is recorded
And the local console does not invent an acceptance scope.

### 场景 LC.T5.8：验收 store timeout 释放 drain
Given a local acceptance pre-pass SQLite command never settles
When the configured local store timeout is reached
Then the session drain is released
And the triggering message remains retryable or visibly diagnosed
And no successful acceptance fact is saved for that attempt.

### 场景 LC.T5.DL1：连续失败只 dead-letter 一次
Given a local source message repeatedly fails with the same non-timeout processing error
When the failure count reaches the local retry limit
Then the local timeline contains one visible dead-letter system record for that source message
And `local_dead_letters` contains one matching fact
And later polling does not write another dead-letter for the same source message
And the session can process a later local message.

### 场景 LC.T5.DL2：agent response 提交前失败不会重复回复
Given `recordAgentResponse` fails before commit for the same local source message until the retry budget is exhausted
When local processing settles
Then the local timeline contains one visible dead-letter system record for that source message
And `local_dead_letters` contains one matching fact
And no agent response is duplicated
And the session can process a later local message.

### 场景 LC.T5.DL3：dead-letter 可见写失败保持可重试
Given a local source message has exhausted the local retry budget
And writing the visible dead-letter system record fails
When local processing settles
Then the local processing cursor is not advanced
And no successful `local_dead_letters` fact is saved
And a later retry can attempt the visible dead-letter write again.

### 场景 LC.T5.DL4：dead-letter reason 不会自触发
Given a local source message dead-letters with a reason that contains handoff-like text
When the visible dead-letter system record is written
Then the visible dead-letter system record contains no legal agent mention
And later local drain does not trigger an agent from the dead-letter system record.

### 场景 LC.T5.R1：重启 catch-up 不重复已完成 response
Given a local session already contains a persisted agent response
And the process restarts before the next local trigger is claimed
When the local console server starts and runs catch-up
Then the persisted agent response is not written a second time
And the next unprocessed trigger can still be processed.

### 场景 LC.T5.R2：stale running 重启后释放 session
Given a local source message is left running across process restart
When local startup stale repair marks the run stuck
Then the local timeline shows a visible stuck record with reason and runDir when available
And the session no longer reports a running source message
And a later local message can be accepted and processed.
