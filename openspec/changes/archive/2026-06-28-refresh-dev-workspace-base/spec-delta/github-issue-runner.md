# github-issue-runner spec delta

## 修改
- `dev` pre script 新建 issue worktree 前 MUST 刷新目标仓库远端 `main` tracking ref，并 MUST 从已刷新的远端 `main` tracking ref 创建 worktree；MUST NOT 依赖本地 bare repo 的 `HEAD` 作为新 worktree 基线。
- `dev` pre script 复用已有 issue worktree 前 MUST 刷新目标仓库远端 `main` tracking ref，并 MUST 检查当前 worktree `HEAD` 是否包含最新远端 `main`。
- 当已有 `dev` issue worktree 落后最新远端 `main` 时，pre script MUST fail closed，不自动 rebase、不自动 merge、不调用 Codex、不发表评论、不推进 role thread 状态。
