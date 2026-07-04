# 提案：issue-worktree-capability-t5

## 背景
里程碑 3 的并行子 issue 与验收闭环要求非 dev 角色能进入同一个 issue 的真实 worktree：qa 需要在实现现场跑测试和做页面走查，product-manager / hermes-user 需要起服务亲自执行验收语句。现状 worktree 供给绑定 `agents/dev.md` 的 `dev-workspace` preScript，物理路径和本地分支都带 role，`.state/agent-contexts.json` 也按 issue + role 保存 context。结果是同一个 issue 里 dev、qa、验收角色看不到同一个工作目录。

另一个阻断是既有重建策略：复用 dev worktree 时如果 `origin/main` 前进，preScript 会强制删除并从最新 main 重建。这在单 issue 串行实现时还能接受，但在里程碑 3 的并行子任务和验收中场景里会摧毁进行中工作：其他任务合入 main 不应导致当前 issue 的未验收 worktree 被 runner 自动删除。

product-manager 已确认本任务只处理 issue 级 worktree 资源化与重建策略修订；不做圆桌拓扑、观察页、goal-intake、人工 dogfood，也不处理 qa no-playbook 结论行规则。

## 提案
把 workspace 从 dev 专属 preScript 升级为 runner 内置的 issue 级 capability：

- agent Markdown frontmatter 新增 `workspaceAccess: write | read-run`。该字段只触发内置 issue-worktree capability，不允许 agent Markdown 指定任意脚本。
- 首批启用角色：`dev` 声明 `write`；`qa`、`product-manager`、`hermes-user` 声明 `read-run`。`dev-manager`、`ceo`、`secretary` 不纳入首批。
- 同一个 GitHub issue 下声明 workspace capability 的角色共享同一个 issue 级 worktree。新建 context 使用去 role 化路径与分支；旧 dev context 懒迁移为 issue 级 context，并保留既有 `worktreePath`，不强制搬迁或重建。
- 首建仍基于最新 `refs/remotes/origin/main`。复用已有 issue worktree 时只刷新 / 检测 main 是否前进，并把结果作为可观察状态和 prompt context；不自动删除、不自动重建、不自动 merge/rebase。
- workspace prepare 中的 git 子进程必须有界：clone、fetch、worktree add/remove、merge-base 等调用超时后必须 settle 为失败，释放 issue in-flight 与 repo cache lock，不能让同 repo workspace 供给永久停摆。
- `read-run` 是协作约束，不是 OS 级强制隔离：角色不得有意修改源码、提交或推送，但允许跑测试、起服务、产生构建缓存、测试输出和验收截图等临时产物。
- 保留现有 `preScript` registry 机制供 `ceo-ledger-context`、`current-repo-workspace` 等确定性前置动作使用；`workspaceAccess` 与任意脚本路径无关。
- 方案必须保留 tranfu-agents-app issue 96 的 QA live-walkthrough 作为正式产品验收场景，同时在本仓库提供可重复的单元 / 集成测试模拟，避免外部 repo 环境成为唯一验收依据。

## 影响
- 业务域：`github-issue-runner`。
- 运行时代码：`src/agent-manifest.ts`、`src/agent-prescripts/types.ts`、`src/agent-prescripts/index.ts`、新增或替换 issue-worktree capability 模块、`src/agent-context-state.ts`、`src/runner.ts`。
- persona：`agents/dev.md`、`agents/qa.md`、`agents/product-manager.md`、`agents/hermes-user.md` 增加 workspace 声明与访问纪律；`dev-manager`、`ceo`、`secretary` 不新增 workspace。
- 测试：新增 / 调整 agent manifest、issue worktree capability、agent context state、runner、persona/frontmatter 相关测试；保留 dev legacy context 兼容测试。
- 事实源：实现完成后更新 `openspec/specs/github-issue-runner/spec.md`、`docs/architecture/module-map.md`、`AGENTS.md`，并把验收证据追记到 `docs/roadmap/milestone-3-orchestration.md` 的 T5 下方。
