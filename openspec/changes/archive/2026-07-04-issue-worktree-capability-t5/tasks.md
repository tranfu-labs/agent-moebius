# 任务：issue-worktree-capability-t5

- [x] 扩展 `src/agent-manifest.ts`：解析并校验 `workspaceAccess: write | read-run`，保持 `preScript` registry 语义不变。
- [x] 实现 issue-worktree capability：去 role 化新建 path / branch、共享同 issue worktree、保留 repo cache 串行化与受控 git argv。
- [x] 为 workspace git 调用增加 timeout / AbortSignal 支持，确保 clone/fetch/worktree/merge-base 永久挂起时 issue job 有界失败并释放 repo lock。
- [x] 扩展 `.state/agent-contexts.json` 读写：兼容 legacy issue+role context，新增 issue workspace context，并支持 legacy dev context 懒迁移。
- [x] 修改 runner：workspaceAccess 成功后传入 Codex cwd 与 prompt context；失败时沿既有 failed / retry / dead-letter 路径，不调用 Codex、不更新 role thread。
- [x] 修订重建策略：复用时刷新并检测 main 前进，但不自动删除、重建、merge 或 rebase；补齐日志 / prompt 状态。
- [x] 更新首批 persona frontmatter 与访问纪律：dev=write，qa/product-manager/hermes-user=read-run；dev-manager/ceo/secretary 不声明 workspaceAccess。
- [x] 补齐单元 / 集成测试：manifest、issue-worktree 首建、共享、懒迁移、main 前进不重建、有界超时与 lock 释放、失败路径、runner 集成、persona 声明。
- [x] 更新事实源：`openspec/specs/github-issue-runner/spec.md`、`docs/architecture/module-map.md`、`AGENTS.md`。
- [x] 执行验证：`pnpm test`、`pnpm typecheck`、必要的聚焦测试命令和 `git diff --check` 均退出码 0。
- [x] 保留正式产品验收：重演 tranfu-agents-app issue 96 的 QA live-walkthrough；若外部环境阻塞，在最终回复中明示卡点。
- [x] 实现验收通过后，把验收证据追记到 `docs/roadmap/milestone-3-orchestration.md` 的 T5 下方并勾选任务。
