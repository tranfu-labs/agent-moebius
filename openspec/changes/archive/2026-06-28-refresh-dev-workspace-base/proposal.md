# 提案：refresh-dev-workspace-base

## 背景
`@dev` 的工作目录由 `src/agent-prescripts/dev-workspace.ts` 准备。当前首次创建 worktree 时会复用本地 bare repo cache，并从该 cache 的 `HEAD` 创建 issue 独占 worktree；同一个 issue 后续再触发时，则直接复用已记录 worktree。

这会带来两个问题：

- 本地 bare repo 的 `HEAD` 可能落后 GitHub 远端默认分支，导致新 issue worktree 一开始就基于旧主线开发。
- 已存在的 issue worktree 不检查远端主线是否已更新，长期运行后更容易在提 PR 或合并主线时才暴露冲突。

## 提案
收紧 `dev-workspace` 的 Git 基线规则，保持最小行为面：

- 每次准备 `@dev` worktree 前，刷新目标仓库远端 `main` 的本地 tracking ref。
- 新建 issue worktree 时，不再从 bare repo 的 `HEAD` 创建，而是明确从最新远端 `main` tracking ref 创建。
- 复用已有 issue worktree 时，只检测其基线是否已经落后最新远端 `main`。
- 如果已有 worktree 落后最新远端 `main`，pre script fail closed，跳过 Codex、跳过 GitHub 评论、保持 role thread 状态不变，并返回可诊断原因。
- 不自动 rebase、不自动 merge，避免 runner 把工作目录留在半冲突状态。

## 影响
- 受影响模块：`src/agent-prescripts/dev-workspace.ts` 与对应单元测试。
- 行为规格域：`github-issue-runner`。
- `@dev` 新建工作目录的基线从“本地 cache HEAD”变为“已刷新远端 main”。
- 已存在但落后主线的 issue worktree 会提前失败，而不是继续在旧基线上运行 Codex。
