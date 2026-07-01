# github-issue-runner spec delta

## 新增
- MUST 在拉取 issue 时同时读取 GitHub `state` 字段（`OPEN` / `CLOSED`），并作为 `GitHubIssue` shape 的必填字段。
- MUST 在 active poll 或 idle-scan changed-issue 处理路径中发现 issue `state = CLOSED` 时，把该 issue 从 `.state/github-response-intake.json` 移除（与 `issue-not-found` 语义一致），不调用 trigger、不调用 Codex、不发评论；MUST 记录 `event = "skip"`、`reason = "issue-closed"` 与 `issueKey`。
- MUST 在单 issue 处理返回 `failed` 时把该 issue 的 `updatedAt` 同步为刚拉取的最新值、`activeNoChangeCount` 累加 1、`nextPollAt` 设为处理时间后 `activeIssuePollIntervalMs`；一旦累加到 `activeIssueNoChangeLimit`，MUST 立即把 `mode` 降为 `idle` 并把 `nextPollAt` 设为 `null`，避免持续失败导致每 tick 触发。
- MUST 在 `dev` pre script 检测到已有 worktree 落后最新远端 `main` 时先强制删除该 worktree（`git worktree remove --force`；失败时 fallback 到 `rm -rf` + `git worktree prune`），再从 `refs/remotes/origin/main` 重建；重建过程任一步失败 MUST 返回 fail closed 且不推进 Codex / GitHub 评论 / role thread 状态；重建成功 MUST 记录 `event = "agent-prescript-completed"` 并保持原 `context state`。
- MUST 在 stale worktree 自动重建过程中丢弃 worktree 内未推送的本地 commit；文档层面需明确 agent 产出的落地口径是 commit + push，未 push 的改动不属于要保护的运行时状态。

## 修改
- 原规则「MUST NOT 在 pre script 执行、Codex 执行或 GitHub comment 发布失败时推进已处理 `updatedAt`」的语义收敛为：**失败时 MUST 同步 `updatedAt` 到刚拉取的 latest 值以避免下一 tick 判定为 changed 从而形成循环**；同时 `role-thread` 状态与 GitHub 评论仍 MUST NOT 因失败推进，`activeNoChangeCount` 走 no-change tick 累加以保证收敛降级。
- 原规则「MUST 在已有 `dev` issue worktree 落后最新远端 `main` 时 fail closed，不自动 rebase、不自动 merge、不调用 Codex、不发评论、不推进 role thread 状态」的行为收敛为：**MUST 在已有 `dev` issue worktree 落后最新远端 `main` 时自动删除并从 `refs/remotes/origin/main` 重建 worktree**；重建失败才 fail closed（不 Codex / 不评论 / 不推进 role thread）。
- 原规则「MUST 在 `no-trigger` 后更新 intake state，避免未变化 issue 被重复 fetch」的应用范围扩展为：**`no-trigger` 与 `failed` 都必须推进 `nextPollAt` 与 `updatedAt`**，`triggered-success` / `issue-not-found` / `issue-closed` 走各自既有分支。

## 场景

### 场景 A：failed 后 issue 保持 active、活跃无变化计数单调累加、到上限降级

Given `.state/github-response-intake.json` 中 `tranfu-labs/tranfu-agents-app#48.mode = active`
And 该 issue 的最新 `updatedAt` 是 T2
And 处理返回 `failed`（例如 dev pre script 失败或 Codex 失败）
When runner 调用 `recordIssueProcessingOutcome`
Then 系统把 `.state/github-response-intake.json` 中该 issue 的 `updatedAt` 更新为 T2
And 把 `mode` 保持为 `active`
And 把 `activeNoChangeCount` 累加 1
And 把 `nextPollAt` 设为处理时间后 `activeIssuePollIntervalMs`
And 当 `activeNoChangeCount` 达到 `activeIssueNoChangeLimit` 时 `mode` 降为 `idle`
And `nextPollAt` 设为 `null`

### 场景 B：active poll 见 CLOSED 时从 state 移除

Given `.state/github-response-intake.json` 中 `tranfu-labs/agent-moebius#10.mode = active`
And 用户在 GitHub 上关闭了 issue #10
When 一次 active poll 拉取该 issue
Then `gh issue view` 返回 `state = "CLOSED"`
And 系统记录 `event = "skip"`、`reason = "issue-closed"`、`issueKey = "tranfu-labs/agent-moebius#10"`
And 不调用 trigger、不调用 Codex、不发评论
And `.state/github-response-intake.json` 中该 issue 记录被移除
And 下一 tick `getDueActiveIssueSources` 不再返回该 issue

### 场景 C：dev prescript 命中 stale worktree 自动重建成功

Given `.state/agent-contexts.json` 中已有当前 issue + `dev` context
And 该 context 的 worktreePath 存在但落后于最新 `refs/remotes/origin/main`
When 最新消息再次包含 `@dev`
Then 系统先 `git worktree remove --force` 旧 worktree
And 从 `refs/remotes/origin/main` 重建同一路径的 worktree
And 返回 `{ ok: true, codexCwd: <worktreePath> }`
And 保留原 `agent context state`
And 系统记录 `event = "agent-prescript-completed"` 与 `codexCwd = <worktreePath>`

### 场景 D：dev prescript 重建 worktree 时失败 fail closed

Given `.state/agent-contexts.json` 中已有当前 issue + `dev` context
And 该 context 的 worktreePath 落后于最新 `refs/remotes/origin/main`
And `git worktree remove --force` 与 fallback `rm -rf` 均失败，或后续 `git worktree add` 失败
When 系统尝试自动重建 worktree
Then 系统返回 `{ ok: false, reason = "stale-worktree-rebuild-failed:<detail>" }`
And 不调用 Codex、不发评论、不更新 `.state/role-threads.json`
And 由 `failed` 分支按新规则推进 `nextPollAt` 与 `activeNoChangeCount`
