# 设计：harden-dev-workspace-prescript

## 方案

### 1. 同 bare repo 串行化：进程内 keyed mutex

在 `dev-workspace.ts` 模块作用域新增：

```
const repoLocks: Map<string, Promise<unknown>>
withRepoLock<T>(key: string, fn: () => Promise<T>): Promise<T>
```

语义：

- `prev = repoLocks.get(key) ?? Promise.resolve()`
- `next = prev.then(fn, fn)`（前一个成/败都不阻塞后续；`fn` 的返回值 / 异常都由 `next` 承担）
- `repoLocks.set(key, next.catch(() => {}))`（塞回去时吞异常，避免污染下一个等待者）
- `return await next`（抛错正常向上传给临界区调用者）

不清理 Map 项——最坏情况下里面保留 O(bare repo 数) 个已完成 Promise，量级极小；显式清理反而引入「清理与新进入者的 CAS」这类复杂度，得不偿失。

### 2. 临界区在哪两处

`runDevWorkspacePreScriptUnsafe` 里现有两条路径都要包锁，但拆法不同：

- **existing state 路径**（stale 重建分支，`isGitAncestor` 判定 worktree 不含最新 main 时）：**两段独立进锁**——`refreshRemoteMain` 单独一个 `withRepoLock(repoCachePath, ...)`；随后 `isGitAncestor` 在锁外做（它只读 worktree HEAD 与 bare repo 的 ref，git 允许并发读）；判 `!containsLatestMain` 时再进第二个 `withRepoLock(repoCachePath, ...)` 包住 `removeWorktree` + `worktree add`。
  - 为什么拆两段而不是一段整体：原代码对 refresh 失败与 rebuild 失败**分类不同**——refresh 抛错会被外层 catch 冒泡为 `dev-workspace-error:`，rebuild 抛错走内层 try/catch 返回 `stale-worktree-rebuild-failed:`。两个 reason 前缀对上游（尤其是即将落地的 `at-least-once-issue-intake` 里 `lastFailureReason` / 死信摘要）诊断价值不同。合并成一段锁会让 refresh 失败也被贴上 rebuild 的标签，语义倒退。两段锁之间的短暂释放窗口不影响正确性：`refresh` 幂等（origin/main 就是那个 sha），`isGitAncestor` 是读，`worktreePath` 是本 issue 独占（跨 issue 天然无冲突）。
  - 命中直接返回的 `containsLatestMain === true` 分支不需要第二次进锁。
- **新首建路径**：把「条件 clone → `refreshRemoteMain` → `worktree add`」三段整体进锁——这里不存在类似的 reason 分类，且三段共享一个原子语义（首建要么全成要么全败）。前置的 `pathExists(worktreePath)`（判有无残留）与两次 `mkdir(dirname(...))` 保持锁外；后置的 `saveStateEntry` 保持锁外（写不同 issueKey，天然无冲突）。

**行为不变**：existing state 路径上，即使 worktree 已经含最新 main、能直接复用，仍然会做一次 `refreshRemoteMain`——这是原代码的设计，本 change 不改。

### 3. worktree 本地分支命名

新增纯函数 `buildLocalBranchName(input: AgentPreScriptInput): string`：

```
`agent/${safePathSegment(input.role)}/${safePathSegment(input.issueSource.owner)}__${safePathSegment(input.issueSource.repo)}__${input.issueSource.issueNumber}`
```

- `safePathSegment` 已存在，把非 `[A-Za-z0-9._-]` 一律替换为 `_`，同时也是合法 git branch 名字符集（不含 `..` / `/.` / 空格 / `~` / `^` / `:` / `?` / `*` / `[` 等禁用序列）。
- 顶层 `agent/` 前缀是一眼可辨的「受控分支」marker，避免与手推 branch 混淆；`role` 段允许未来加除 `dev` 外的 role 时命名不冲突。

### 4. `worktree add` 命令改造

两处（首建、stale 重建）统一改成：

```
git --git-dir <bare> worktree add -B <localBranch> <worktreePath> refs/remotes/origin/main
```

- `-B` 与 `-b` 的区别：`-b <br>` 在 `<br>` 已存在时报错并退出；`-B <br>` 已存在则强制 reset 到 target，等价于「不管有没有，都让它对上 origin/main」。
- 我们只关心「worktree 起点是 origin/main、branch 名是这个字符串」，不关心之前 branch 指向哪；`-B` 精确对应这个不变量。
- **不**需要额外 `git branch -D` 或先检查 branch 是否存在——`-B` 一步内建。

### 5. `runGit` 支持捕获 stderr（可选，看是否与 at-least-once change 撞车）

现有 `runGit` 用 `stdio: ["ignore", "ignore", "ignore"]`，命令失败时只能拿到 exit code。本 change 的 race 定位是靠事后推理的——如果错误里带一行 stderr，定位会立刻明朗（`cannot lock ref ...`、`branch already exists` 之类都会秒懂）。

但 `2026-07-03-at-least-once-issue-intake` 的 tasks 里已经列了这项改造（供 `lastFailureReason` 使用）。为避免双 change 撞同一段代码：

- **本 change 不动 `runGit` 的 stdio**，让 at-least-once change 专门做这件事。
- 若 at-least-once change 归档时本 change 还没归档，本 change 归档时对 stderr 相关的 spec 语句不写 delta；反之亦然。

## 权衡

- **为什么不在 runner 层做同 repo 派发聚合**：runner 层已有 `CODEX_DRIVER_POOL_MAX_CONCURRENT` 与 issue-dispatcher 的 in-flight 集合，逻辑相对复杂；再叠一层「同 repo 只跑一个 prescript」的语义会让派发链路难懂。把 race 的解决方案下沉到出现冲突的**唯一模块**（`dev-workspace.ts`）内部，改动面积最小、语义最内聚、其他 prescript 若未来也共享底层资源可以复用同一个 `withRepoLock` pattern。
- **为什么不给 mutex 加超时**：git 操作自身有网络超时（默认 fetch 卡死不会超过 http 层超时），非网络失败 fn 会 throw、Promise 链自动 release；加超时反而可能在 fetch 尚未完成时切断锁，导致下一个进入者撞到进行中的 `.lock` 文件——把一个可诊断的失败换成一个更神秘的失败。真出现死锁只能是 fn 里出现"既不 resolve 也不 reject 也不 throw" 的死循环，这属于代码 bug，应该改代码不是加超时。
- **为什么用 `-B` 而不是 `-b` + 首次检查**：两步走多一次 `git branch --list` IO，也让代码路径分叉；`-B` 就是 git 官方给「幂等 create-or-reset」的答案。
- **为什么不迁移旧 worktree**：旧 worktree 目前物理上能用，只是 agent 观测层面「看到 detached HEAD 觉得奇怪」；写一次性迁移脚本要处理各种 corner case（本地未提交改动、branch 已存在于其他 worktree 等），投入与收益不成正比。它们会随着 issue 自然关闭 → context 清理 → 重建流转掉。
- **为什么不加手动 replay 入口**：`2026-07-03-at-least-once-issue-intake` 的死信 / 重试预算机制会让这类瞬时失败自然重试；单独造一个 replay 入口是重复投资。本次 #28 具体这一条丢失，等 at-least-once 落地后由用户在 issue 上写一句新评论即可重新触发（这是 at-least-once 提案里明确保留的恢复姿势）。

## 风险

- **`-B` 的隐性副作用**：`worktree add -B` 会把已存在的同名 branch 强制指向 `origin/main`。如果外部有人手动把这个 branch 拿去做别的事（比如推到 GitHub），会被无声覆盖。缓解：`agent/` 前缀本身就是「工具专属，不要人手动碰」的约定；如果未来发现有滥用，可加一个「若 branch 存在且非空 upstream，拒绝重建并 fail-fast」的守卫。当前不做。
- **branch 名边缘 case**：`safePathSegment` 对 `[A-Za-z0-9._-]` 之外一律替换 `_`；git branch 名禁用 `..`（两个连续点），但 `safePathSegment` 保留 `.`。理论上 owner/repo 中出现 `..` 才会命中，GitHub 用户名与仓库名均不允许 `..`，暂无风险。若未来 role 引入 `..` 需要在 `buildLocalBranchName` 加额外过滤。
- **mutex Map 无 GC**：进程整个生命周期内每见到一个新 bare repo 会插入一个 Map 项且不会移除，但值持有的是一条已 settle 的 Promise 链尾；单进程活到监控什么级别的 repo 数量都不会成为问题。
- **回滚**：本 change 只动一个文件的两处 + 一个测试文件。回滚 = 把 `-B <br>` 去掉、把 `withRepoLock` 包装去掉，两个 Git patch 逆向即可，无状态 / DB / 外部副作用需要清理。
