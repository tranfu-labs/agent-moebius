# 任务：harden-dev-workspace-prescript

## 实现

- [ ] `src/agent-prescripts/dev-workspace.ts`：新增模块级 `repoLocks: Map<string, Promise<unknown>>` 与 `withRepoLock<T>(key, fn)` 工具函数。
- [ ] `src/agent-prescripts/dev-workspace.ts`：新增 `buildLocalBranchName(input): string`，返回 `agent/<safe(role)>/<safe(owner)>__<safe(repo)>__<issueNumber>`。
- [ ] `src/agent-prescripts/dev-workspace.ts`：`runDevWorkspacePreScriptUnsafe` 新首建路径——把「条件 `clone --bare` → `refreshRemoteMain` → `worktree add`」三段包进 `withRepoLock(paths.repoCachePath, ...)`；`worktree add` 参数改为 `["--git-dir", paths.repoCachePath, "worktree", "add", "-B", localBranch, paths.worktreePath, REMOTE_MAIN_REF]`。
- [ ] `src/agent-prescripts/dev-workspace.ts`：`runDevWorkspacePreScriptUnsafe` existing state 路径——`refreshRemoteMain` 单独进一个 `withRepoLock`（保留原有 `dev-workspace-error:` 错误分类）；`isGitAncestor` 保持锁外；`!containsLatestMain` 时把 `removeWorktree` + `worktree add` 再进第二个 `withRepoLock`（保留 `stale-worktree-rebuild-failed:` 错误分类）。`worktree add` 参数加 `-B <localBranch>`。`containsLatestMain === true` 的复用分支不进第二次锁。

## 测试（单元）

- [ ] `tests/dev-workspace.test.ts`：新增 `derives a controlled local branch name from role/owner/repo/issue` 与 `normalizes owner/repo characters when building the local branch name` —— 直接单测 `buildLocalBranchName`。
- [ ] `tests/dev-workspace.test.ts`：新增 `serializes calls sharing the same repo cache key` —— 用 gate Promise 让 fake runGit 的第 1 次 `worktree add` 挂起；同一 repoKey 的两个 prescript 并发发起；断言第 2 次的 `fetch` 未在第 1 次 `worktree add` resolve 前开始，且最终两次都完成。
- [ ] `tests/dev-workspace.test.ts`：新增 `runs different repo cache keys in parallel` —— 两个不同 owner/repo 的 input 并发跑；不用 gate，只断言两次 prescript 各自的 `clone` / `fetch` / `worktree add` 都被调用、总调用次数正确。
- [ ] `tests/dev-workspace.test.ts`：新增 `releases the repo lock when the critical section throws` —— fake runGit 让第 1 次的 `refreshRemoteMain` 抛错；第 2 次同 repoKey 仍能被 withRepoLock 派到并正常完成（不 hang、不继承前者的 error）。
- [ ] `tests/dev-workspace.test.ts`：新增 `worktree add uses -B and the derived local branch name on first-time build` —— 断言首建路径 runGit 命令序列中的 `worktree add` 参数是 `["--git-dir", <bare>, "worktree", "add", "-B", "agent/dev/tranfu-labs__agent-moebius__4", <worktreePath>, REMOTE_MAIN_REF]`。
- [ ] `tests/dev-workspace.test.ts`：新增 `worktree add uses -B on stale rebuild` —— 用 stale worktree 的既有测试骨架，让 `isGitAncestor` 返回 false，断言重建时 `worktree add` 参数也带 `-B <localBranch>`。
- [ ] `tests/dev-workspace.test.ts`：回归——把现有 `creates a repo cache and issue-specific worktree on first run` / `reuses an existing context after confirming it contains latest main` / stale 重建 / context-mismatch 等所有断言 `worktree add` 参数的用例，同步补上 `-B <localBranch>`。

## 手动 / AI 验证

- [ ] 跑 `npm run build`（tsc 通过）。
- [ ] 跑 `npm test -- dev-workspace`（新老单测全绿）。
- [ ] 挑一个白名单 open issue 触发一次 prescript，断言：
  - `git -C <worktreePath> branch --show-current` 输出 `agent/dev/<owner>__<repo>__<issue>`；
  - `git -C <worktreePath> status` 首行不含 `HEAD detached`；
  - `ls <worktreePath>` 见 `package.json` 等项目文件。
- [ ] （可选强验证）同一秒对同 repo 派发两个 @dev mention，日志两次 `agent-prescript-completed` 均成功，无 `git failed with exit-code-1`。
