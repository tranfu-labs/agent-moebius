# local-console 规格

## 域定位

`local-console` 是默认本地对话操作台的数据通道。它复用 GitHub issue runner 已有的 conversation、mention trigger、agent persona 与 Codex driver 能力，但输入输出落在本机 HTTP API 与 `.state/local-console.sqlite`，供 Electron 操作台或本地浏览器客户端使用。

本域只规定一个本地项目下多会话、运行直播、中断、卡住状态和本地错误记录；不承载 T5 的交棒总线、CEO 兜底、子会话编排、验收全功能对等，也不承载 T6 的 GitHub/local 互斥启动 flag。

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

### 边界
- MUST NOT modify `conversation`, `triggers`, agent mention parsing, stage parsing, CEO guardrail, goal-ledger business rules, or GitHub issue runner semantics to satisfy local-console behavior.
- MUST NOT implement T5-only local equivalents for CEO no-mention fallback, child session orchestration, full acceptance pre-pass, dead-letter parity, or artifact publishing.
- MUST NOT implement T6 GitHub/local mutually exclusive startup flag or cross-mode data migration in this domain.

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
