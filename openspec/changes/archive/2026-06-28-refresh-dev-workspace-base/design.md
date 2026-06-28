# 设计：refresh-dev-workspace-base

## 方案
在 `dev-workspace` pre script 中增加一个明确的远端主线同步步骤。

### Git ref 策略
使用专用 tracking ref 表示已刷新的远端主线：

```text
refs/remotes/origin/main
```

刷新时通过参数数组调用 Git：

```text
git --git-dir <repoCachePath> fetch --prune origin +refs/heads/main:refs/remotes/origin/main
```

这样不会依赖 bare repo 的 `HEAD`，也避免直接更新 `refs/heads/main` 时影响已经 checkout 到其他 worktree 的本地 `main` 分支。

### 新建 worktree
首次处理某个 source issue 时：

1. cache 不存在：先 `git clone --bare <cloneUrl> <repoCachePath>`。
2. 无论 cache 是新建还是已有，都刷新 `refs/remotes/origin/main`。
3. 使用最新 tracking ref 创建 worktree：

```text
git --git-dir <repoCachePath> worktree add <worktreePath> refs/remotes/origin/main
```

### 复用已有 worktree
后续同 issue + role 再触发时：

1. 校验 context 与 worktree 可访问。
2. 刷新 `refs/remotes/origin/main`。
3. 检测当前 worktree `HEAD` 是否包含最新 `origin/main`：

```text
git -C <worktreePath> merge-base --is-ancestor refs/remotes/origin/main HEAD
```

如果退出码为 0，说明当前 worktree 已包含最新主线，可以继续复用。

如果退出码为 1，说明当前 worktree 落后最新主线，返回失败原因，例如：

```text
stale-worktree-base:<worktreePath>
```

其他退出码作为 Git 执行错误处理。

### 测试与验证
单元测试覆盖：

- 新建 repo cache 时也会刷新远端 `main` tracking ref，并从该 ref 创建 worktree。
- 已有 repo cache 时刷新远端 `main` tracking ref，再创建 worktree。
- 已有 context 且 worktree 最新时，刷新并检查后复用。
- 已有 context 且 worktree 落后时，返回 fail closed，不调用 Codex。

AI 验证流程：

- 运行 `pnpm test`。
- 运行 `pnpm typecheck`。

## 权衡
不做自动 rebase / merge。自动处理虽然能减少人工操作，但一旦发生冲突，runner 可能把 issue worktree 留在半合并状态；这比提前失败更难诊断。

不再使用 bare repo 的 `HEAD`。`HEAD` 表达的是本地 cache 当前默认引用，不等于远端最新主线。显式 tracking ref 能让行为更可预测。

暂时固定刷新 `main`。当前系统和问题上下文都围绕 `main`，先以最小改动解决现有冲突来源；未来如需支持非 `main` 默认分支，可再通过 GitHub repo metadata 或 config 扩展。

## 风险
如果目标仓库没有 `main` 分支，本 change 会让 `@dev` pre script 失败。当前监听目标预期使用 `main`，失败原因会暴露在 runner 日志中，后续可扩展为可配置默认分支。

如果已有 worktree 已经落后主线，后续 `@dev` 会停止，需要人工在对应 worktree 中 rebase / merge 后再触发。这是有意选择，用提前失败换取不污染工作区。
