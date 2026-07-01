# 任务：fix-runner-issue-processing-loop

## A · failed 分支推进 state
- [x] `src/github-response-intake.ts`：`IssueProcessingOutcome` 追加 `"issue-closed"`；`recordIssueProcessingOutcome` 的 `failed` 分支改为"同步 `updatedAt` 到 latest + `activeNoChangeCount++` + 推 `nextPollAt` + 到上限降级 idle"；`issue-closed` 分支复用 `issue-not-found` 的删除语义
- [x] `tests/github-response-intake.test.ts`：新增单测（1）failed 分支同步 `updatedAt`、累加 `activeNoChangeCount`、设 `nextPollAt`；（2）failed 累到 `activeIssueNoChangeLimit` 降级 idle；（3）`issue-closed` outcome 从 state 移除

## B · dev prescript stale worktree 自愈
- [x] `src/agent-prescripts/dev-workspace.ts`：`DevWorkspaceDependencies` 追加 `removeWorktree(path)`；`containsLatestMain === false` 分支改为"removeWorktree → git worktree add refs/remotes/origin/main → access 断言"；任一步失败返回 `stale-worktree-rebuild-failed:<detail>`；保留 `agent context state`
- [x] `tests/dev-workspace.test.ts`：新增单测（1）stale 分支调 `removeWorktree` 再 `worktree add`，返回 `{ok:true, codexCwd}`；（2）`removeWorktree` 失败 fallback 到 rm -rf + prune；（3）re-add 失败返回 `stale-worktree-rebuild-failed`

## C · 感知 issue 关闭
- [x] `src/github.ts`：`buildFetchIssueWithCommentsArgs` 增加 `state` 字段；`GitHubIssue` 类型加 `state: "OPEN" | "CLOSED"`；`isGitHubIssue` 更新校验
- [x] `tests/github.test.ts`：新增单测（1）`buildFetchIssueWithCommentsArgs` 包含 `state`；（2）`isGitHubIssue` 接受 `state: "OPEN"/"CLOSED"`、拒绝其他值
- [x] `src/runner.ts`：`pollActiveIssue` 与 `fetchAndProcessChangedIssue` 在 fetch 后先判 `state === "CLOSED"` → 调 `recordIssueProcessingOutcome` 用 `issue-closed` outcome + log `event="skip", reason="issue-closed"`；不进 `processIssueSource`
- [x] `tests/runner.test.ts`：新增单测 pollActiveIssue 见 CLOSED 短路（不调 Codex、不发评论、intake state 中 issue 被移除）

## 验证
- [x] `./node_modules/.bin/tsc --noEmit` 通过（当前环境的 pnpm 11 wrapper 被 build approval 拦截，已用本地二进制执行等价 typecheck）
- [x] `./node_modules/.bin/vitest run` 通过（含上面新增单测）
- [x] AI 验证 1：单测模拟关闭 active issue → 看到 `event="skip", reason="issue-closed"`，state 里该 issue 消失
- [x] AI 验证 2：单测模拟 main 有新提交、触发 dev issue → stale worktree 自动 rebuild 后返回 `{ ok: true, codexCwd }`
- [x] AI 验证 3：单测模拟 prescript/处理失败累计到上限 → failed 分支第 5 次降级 idle，不再每 tick 触发
