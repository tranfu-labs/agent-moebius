# 提案：harden-dev-workspace-prescript

## 背景

2026-07-03 一次心跳同时对 `tranfu-labs/moebius` 派发了 #28 与 #29 两个 dev job（同毫秒触发）。#29 成功、#28 失败并被日志记为 `agent-prescript-failed:git failed with exit-code-1`。复盘定位到 `src/agent-prescripts/dev-workspace.ts` 里两个独立缺陷：

1. **同 bare repo 并发 race**。所有指向同一个 GitHub repository 的 dev worktree 共享一份 bare cache `repos/<owner>__<repo>.git`。首建路径与 stale 重建路径都会连续跑 `git clone --bare`（若缺失）、`git fetch --prune`、`git worktree add` 三段命令，且都写共享 git ref（`refs/remotes/origin/main`、`worktrees/<name>/HEAD`）。同心跳内对同 repo 派发的两个 prescript 并发进入这三段时，输者拿不到 `refs/remotes/origin/main.lock`，git 直接以 exit code 1 退出。runner 层没有按 repo 聚合派发，prescript 内部也没有针对 bare repo 的临界区。

2. **worktree 停留在 detached HEAD**。`git worktree add <path> refs/remotes/origin/main` 是把 remote-tracking ref 直接 checkout 出来，产生 detached HEAD 状态：`git branch --show-current` 为空、`git status` 首行是 `HEAD detached at <sha>`、`git rev-parse --abbrev-ref HEAD` 返回字面量 `HEAD`。agent 在 worktree 内跑 git 时会把「当前分支是 HEAD」误读为异常，并向用户输出「worktree 只有 HEAD」这类容易被当成 bug 的说法。这个状态是 `worktree add` 的**行为**而非**故障**，但它让运行观测长期带噪、也让后续做「相对当前分支」的检查不成立。

两个缺陷都在 dev-workspace pre script 内部、且都以「worktree 建成之后的可观察状态」为出口，合并在一个 change 里比拆两个 change 归档 / spec-delta / 提交历史都更省事。

## 提案

一次加固 dev-workspace pre script，同时解决上面两个缺陷：

1. **同 bare repository 串行化**。在 `dev-workspace.ts` 内部维护一个按 `repoCachePath` keyed 的进程内 mutex，把「访问 bare repo 的 git 操作」——首建路径的条件 clone、`refreshRemoteMain`、`worktree add`，以及 stale 重建路径的 `refreshRemoteMain`、`removeWorktree`、`worktree add`——分别整块进临界区。跨不同 bare repository 的 prescript **MUST NOT** 相互阻塞。锁不做超时（git 命令自身有网络超时；临界区代码抛错由 Promise finally 链自动 release）。

2. **worktree checkout 到受控本地分支**。把 `worktree add` 命令改为 `worktree add -B agent/<role>/<owner>__<repo>__<issue> <path> refs/remotes/origin/main`，让 worktree 停在一个命名清晰的本地分支上：
   - 命名 `agent/<role>/<owner>__<repo>__<issue>`，owner/repo/role 经 `safePathSegment` 规范化。
   - 用 `-B` 而不是 `-b`：branch 不存在则新建、已存在则强制 reset 到 `refs/remotes/origin/main`。这一步同时化解「stale 重建时同名 branch 已存在」的边角。
   - 新首建、stale 重建两条路径统一走 `-B`，不留分支。

3. **保留失败恢复语义**。本 change **不**引入手动 replay、**不**改 intake 状态机、**不**动 runner 派发；这次 #28 的具体丢失依然由已在推进的 `2026-07-03-at-least-once-issue-intake` 落地后自然收敛（intake 层不再因 `failed` 静默推进游标）。本 change 只堵住 race 的根因，让未来同批同 repo 的派发不再触发 exit-code-1。

## 影响

- **业务域**：`github-issue-runner`（唯一域），影响 dev-workspace pre script 的行为规格。
- **模块**：`src/agent-prescripts/dev-workspace.ts`（主要）、`tests/dev-workspace.test.ts`（测试同步）。runner / dispatcher / intake 状态机 **不**改。
- **对外行为变化**：
  - 新建 worktree 现在停在 `agent/<role>/<owner>__<repo>__<issue>` 本地分支，`git branch --show-current` 返回该分支名，不再是 detached HEAD。
  - 同心跳同 repo 派发多个 issue 时 prescript **不**再因 git ref lock 相互踢出，串行完成；跨 repo 派发的 prescript 并发性能不受影响。
  - 已存在的旧 worktree（当前所有 detached HEAD 的存量）**不**被自动迁移；它们仍能工作，只是 agent 观测保持原状，直到自然归档 / 重建为止。
- **与 in-flight change 的关系**：`2026-07-03-at-least-once-issue-intake` 的 tasks 里也列了 `dev-workspace.ts` 的一处修改（`runGit` 捕获 stderr）；那是错误信息可读性改造，与本 change 的临界区 + 分支命名正交，可并行推进不冲突。
- **取代**：无。
