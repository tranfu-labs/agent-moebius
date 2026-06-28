# 任务：refresh-dev-workspace-base

- [x] 调整 `dev-workspace` Git 准备逻辑：每次准备前刷新远端 `main` tracking ref。
- [x] 新建 issue worktree 时从最新 `refs/remotes/origin/main` 创建，不再使用 bare repo `HEAD`。
- [x] 复用已有 issue worktree 时检查当前 `HEAD` 是否包含最新远端 `main`，落后则 fail closed。
- [x] 补充 `dev-workspace` 单元测试，覆盖新建、已有 cache、已有 context 最新、已有 context 落后。
- [x] 更新 `github-issue-runner` 事实规格、模块地图与 AGENTS。
- [x] 运行完整测试：`./node_modules/.bin/vitest run`。
- [x] 运行类型检查：`./node_modules/.bin/tsc --noEmit`。
