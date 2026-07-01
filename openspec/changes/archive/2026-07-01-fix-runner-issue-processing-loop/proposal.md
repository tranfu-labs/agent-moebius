# 提案：fix-runner-issue-processing-loop

## 背景

线上日志出现每 60 秒重复的 `agent-prescript-failed` + `trigger` 交替刷屏，即使把对应 GitHub issue 关掉也不停。定位下来是 3 个原因叠成的死循环：

1. **循环发动机（A）**：[src/github-response-intake.ts:143-145](../../../src/github-response-intake.ts) 里 `recordIssueProcessingOutcome` 遇到 `outcome === "failed"` 直接 `return input.state`，既不推进 `nextPollAt` 也不同步 `updatedAt`。于是每 tick 该 issue 都判定"到期 + 有变化" → 又走 `processIssueSource` → 又 failed → 状态不动 → 又到期。
2. **prescript 无自愈（B）**：[src/agent-prescripts/dev-workspace.ts:94-101](../../../src/agent-prescripts/dev-workspace.ts) 命中 `stale-worktree-base` 就直接 fail，没有"删旧 worktree + 重新从 origin/main 建"这条自愈路径。main 一旦有新提交，历史 dev issue 就永远卡死。叠上 A → 每 tick 触发。
3. **不感知 issue 关闭（C）**：[src/github.ts:88](../../../src/github.ts) 里 `buildFetchIssueWithCommentsArgs` 只拉 `body,comments,updatedAt`，没拉 `state` 字段。用户在 GitHub 上关掉 issue 后，`gh issue view` 仍返回内容，runner 判定不出"已关闭"，`active` 池里的 closed issue 继续被 poll。原本"5 次无变化降级 idle"是兜底，但因为 A 让 issue 每次都判定"有变化"，永远进不了降级分支。

## 提案

三层同时修，缺一不可：

- **A · failed backoff**：`recordIssueProcessingOutcome` 的 `failed` 分支改成"同步 `updatedAt` 到 latest + `activeNoChangeCount++` + `nextPollAt = now + activeIssuePollIntervalMs`；到 `activeIssueNoChangeLimit` 立即降 idle"。保证每次 poll 都推进 `nextPollAt`，且累计能收敛到降级。
- **B · stale worktree 自愈**：`dev-workspace.ts` 命中 stale 时不再直接 fail，而是"remove --force 旧 worktree（失败 fallback 到 rm -rf + worktree prune）+ 从 `refs/remotes/origin/main` 重建"。未推送的本地 commit 会被丢弃（agent 产出的前提是 commit + push）。
- **C · 感知 CLOSED**：`fetchIssueWithComments` 多拉 `state` 字段；`runner.ts` 的 `pollActiveIssue` / `fetchAndProcessChangedIssue` 见 `state === "CLOSED"` 就走一条新 outcome `issue-closed`，与 `issue-not-found` 平行——从 `state.issues` 里删除，不进 `processIssueSource`。

## 影响

- **修改的模块**：`github-issue-runner`（runner.ts）、`github-response-intake`（response-intake.ts）、`agent-prescripts`（dev-workspace.ts）；本次不新增模块。
- **对外行为**：
  - 关闭 GitHub issue 后，最迟下一次 active poll（≤ 1 分钟）该 issue 从本地 state 消失，不再触发 Codex / 评论。
  - prescript 或 Codex 持续失败的 issue，最多 5 次 tick 后自动降级为 idle，日志刷屏止于 5 条。
  - dev 类 issue 的 worktree 落后 origin/main 时不再 fail closed，而是自动重建；**未推送的本地 commit 会被丢**。
  - 现有 `stale-worktree-base` fail closed 行为被替换（会有对应 spec 修改，不视为破坏性变化，因为原行为已经导致死循环）。
- **状态文件**：`.state/github-response-intake.json` 结构不变，只是 failed 分支写入内容变化。
- **架构事实源**：`docs/architecture/` 新增一张 `runner-issue-processing.svg`，归档时从本 change 的 `architecture/after.svg` 复制。
