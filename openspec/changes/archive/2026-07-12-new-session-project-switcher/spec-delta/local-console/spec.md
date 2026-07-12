# local-console spec delta：new-session-project-switcher

## 依赖与冲突替换
本 delta 依赖 `local-console-t46-project-workspace-source` 的 project 持久化、session project 外键、project API 与多 project state shape。当前事实规格仍有“returns one local project”及“under the single local project”旧规则；归档时 MUST 删除或替换这两句，而不是在其后并列追加冲突规则。

替换后的最终规则：

- MUST expose a local console state API that returns the persisted local project list, the selected project, its sessions, the selected session timeline, global running/waiting/stuck/error counts, active run snapshot, and visible local errors.
- MUST support creating and selecting multiple local sessions under any persisted local project; session ids for new local sessions must be stable and persisted in SQLite.
- MUST preserve the project-to-session hierarchy while keeping every session row visually flat within its owning project.

## 新增行为规则

### 空白 session 项目重绑
- MUST allow a local session to change its project only while it has no session messages, no `sessions.parent_session_id` relationship in either direction, and no `session_edges` relationship in either direction.
- MUST require the target project to exist.
- MUST reject project rebinding for GitHub sessions, sessions with any message history, or sessions participating in parent/child orchestration according to either persisted relationship source.
- MUST update session project id and timestamp in one SQLite transaction.
- MUST leave the original project id, messages, cursor, session edges, and project rows unchanged when validation or update fails.
- MUST preserve the session id across a successful rebind.
- MUST keep workspace direct/worktree semantics derived from the newly bound project for the first later run.

### 本地 API
- MUST expose a loopback local-console endpoint that accepts a session id and target project id for the bounded empty-session rebind.
- MUST reject malformed input without mutation.
- MUST return HTTP 400 with a stable error code for invalid JSON or malformed rebind fields, HTTP 404 for a missing local session or target project, and HTTP 409 for a session locked by history or relationships.
- MUST NOT classify expected empty-session rebind rejection as an internal server error or map it by matching human-readable error strings.
- MUST return the updated local session summary after success.
- MUST NOT alter GitHub runner state or GitHub issue session behavior.

## 新增场景

### 场景 LC.NSPS.1：空白 session 原子重绑
Given a local session has no messages, parent column relationship, child column relationship, or session edges
And the target project exists
When the rebind command runs
Then the same session id references the target project
And no message, cursor, edge, or project row is created or deleted.

### 场景 LC.NSPS.2：已有历史拒绝重绑
Given a local session has at least one message, a parent/child relationship in `sessions.parent_session_id`, or a parent/child relationship in `session_edges`
When a client requests rebinding to another project
Then the request fails
And the session project, messages, cursor, and edges remain unchanged.

### 场景 LC.NSPS.3：双事实源失配时 fail closed
Given a local session relationship exists only in `sessions.parent_session_id`
Or the relationship exists only in `session_edges`
When a client requests rebinding either related session
Then the request fails with the stable relationship-conflict code
And neither session changes project.

### 场景 LC.NSPS.4：非法目标无部分写入
Given a local empty session exists
And the requested target project does not exist
When the rebind command runs
Then the command fails
And the session still references its original project.

### 场景 LC.NSPS.5：API 业务错误分流
Given the rebind endpoint receives malformed input, a missing local resource, or a locked session
When the request is handled
Then it returns 400, 404, or 409 respectively with a stable error code
And no expected business rejection is returned as 500.
