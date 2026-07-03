# github-issue-runner spec delta

## 新增

- MUST 让 dev-workspace pre script 在为一个 issue 建立 worktree 时把 worktree checkout 到受控本地分支 `agent/<role>/<owner>__<repo>__<issue>`（`role` / `owner` / `repo` 经 `safePathSegment` 规范化，`issue` 为 `issueNumber` 十进制字符串），MUST NOT 让 worktree 停留在 detached HEAD 状态。新首建路径与 stale 重建路径 MUST 使用同一命名规则，MUST 使用 `git worktree add -B <localBranch> <worktreePath> refs/remotes/origin/main` 语义（分支不存在则创建、存在则强制 reset 到 `refs/remotes/origin/main`）。
- MUST 让 dev-workspace pre script 对同一个 bare repository cache（同一 `repoCachePath`）的 `git clone --bare` / `git fetch --prune` / `git worktree add` / `git worktree remove` 操作按 `repoCachePath` 键值串行执行；跨不同 bare repository cache 的操作 MUST 保持并发不受限。串行化 MUST 在 `dev-workspace.ts` 模块内部完成，MUST NOT 依赖 runner 层派发聚合，MUST NOT 影响 `saveStateEntry` 与 `loadState` 等不接触 bare repository 的步骤的并发性。
