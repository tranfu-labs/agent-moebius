# 设计：issue-worktree-capability-t5

## 方案

### 1. frontmatter：workspaceAccess 是 capability，不是脚本路径

扩展 `src/agent-manifest.ts` 的输出：

```ts
type WorkspaceAccess = "write" | "read-run";

interface AgentManifest {
  body: string;
  preScript: string | null;
  workspaceAccess: WorkspaceAccess | null;
}
```

解析规则：

- `workspaceAccess` 只能是 `write` 或 `read-run`，其他值 fail fast，错误信息指向 agent manifest。
- `workspaceAccess` 不接受路径、不动态 import、不进入 preScript registry。runner 看到该字段后调用内置 issue-worktree capability。
- 现有 `preScript` 语义保留：路径仍必须位于 `src/agent-prescripts/` 且命中静态 registry。
- 若未来某 agent 同时声明 `preScript` 和 `workspaceAccess`，runner 先执行 workspace capability 得到 issue worktree cwd，再执行 preScript；如果 preScript 也返回 `codexCwd` 且与 worktree cwd 冲突，则 fail closed。首批启用角色不需要这种组合。

首批 persona frontmatter 调整：

```md
---
workspaceAccess: write
---
```

用于 dev。

```md
---
workspaceAccess: read-run
---
```

用于 qa、product-manager、hermes-user。

`secretary` 保持 `preScript: src/agent-prescripts/current-repo-workspace.ts`，`ceo` 保持 `preScript: src/agent-prescripts/ceo-ledger-context.ts`，二者不声明 workspaceAccess。

### 2. issue-worktree capability：共享、去 role 化、可懒迁移

新增内置 issue worktree capability 模块，复用现有 `dev-workspace.ts` 中成熟的 git adapter 原语：`runGit`、`removeWorktreeWithFallback`、`safePathSegment`、repo cache keyed mutex。实现时可以选择重命名 / 拆分 `dev-workspace.ts`，但对外语义应变为 issue 级，而不是 dev 级。

新建 issue worktree 的路径和分支去 role 化：

- repo cache：`<WORKDIR_ROOT>/repos/<owner>__<repo>.git`
- worktree：`<WORKDIR_ROOT>/worktrees/<owner>__<repo>__<issue>`
- 本地分支：`agent/<owner>__<repo>__<issue>`

首建流程：

1. 创建 repo cache 和 worktree 父目录。
2. 若 bare repo cache 不存在，执行有界 `git clone --bare <cloneUrl> <repoCachePath>`。
3. 执行有界 `git --git-dir <repoCachePath> fetch --prune origin +refs/heads/main:refs/remotes/origin/main`。
4. 执行有界 `git --git-dir <repoCachePath> worktree add -B <issueBranch> <worktreePath> refs/remotes/origin/main`。
5. 检查 worktree 可访问后保存 issue 级 context。
6. 返回 `codexCwd = worktreePath`，并注入 workspace prompt context。

复用流程：

1. 读取 issue 级 context，校验 owner / repo / issueNumber / worktreePath 与当前配置匹配。
2. 检查 worktreePath 和 repo cache 均存在；缺失时 fail closed，不自动重建。
3. 有界刷新 remote main。
4. 有界检测 `refs/remotes/origin/main` 是否已被当前 worktree `HEAD` 包含。
5. 无论 main 是否前进，都返回已有 worktree；若 main 已前进，只在日志与 prompt context 中标注 `mainStatus = behind-main` 或等价状态，不执行删除、重建、merge、rebase。

懒迁移流程：

1. 如果当前 issue 没有 issue 级 workspace context，但存在 legacy `issueKey -> dev` context，且 owner / repo / issueNumber 匹配、worktreePath 可访问，则创建 issue 级 context 指向这个 legacy dev `worktreePath`。
2. 懒迁移不搬迁目录、不改分支、不执行 stale rebuild、不删除 legacy role entry。
3. 迁移后的 qa/product-manager/hermes-user 与 dev 共享同一路径；新建 issue 才使用去 role 化路径和分支。
4. 若 legacy dev context 缺失或不可访问，则按普通首建路径创建新的 issue 级 worktree。

### 2.1 git 调用有界化与 repo lock 释放

issue-worktree capability 直接消费本地 git 子进程，必须满足系统不变量 L1：任何单点故障不得让 issue job 或同 repo workspace 供给永久停转。

实现要求：

- 新增工作区 git 调用超时配置，例如 `WORKTREE_GIT_TIMEOUT_MS`，默认建议 2 分钟，并写入启动日志。
- `runGit` 或 issue-worktree capability 内的 git adapter 必须支持 timeout 与 `AbortSignal`。超时后终止子进程，让 promise settle 为 deterministic failure，reason 带操作名与 timeout，例如 `workspace-git-timeout:fetch:120000ms`。
- 所有可能进入 repo cache keyed mutex 的 git 操作都必须是 bounded await：`clone --bare`、`fetch --prune`、`worktree add`、`worktree remove`、`worktree prune`。
- `merge-base --is-ancestor` 检测也必须有界；它不一定在 repo lock 内，但仍不能让 issue job 永久不 settle。
- repo cache lock 的 critical section 只包 bounded 操作；任一操作 timeout 或 abort 后 critical section 必须 reject 并释放 lock，后续同 repo issue 可以继续 prepare。
- workspace prepare timeout 进入既有 preScript/capability 失败语义：不调用 Codex、不发表评论、不更新 role thread，由 intake 失败重试 / dead-letter 负责可见性。
- 测试注入永不 settle 的 git dependency 时，应能证明 capability 在超时后返回失败，并且第二个同 repo prepare 不被前一个永久挂住。

### 3. agent context state：兼容旧 shape，新增 issue workspace

`src/agent-context-state.ts` 需要继续能加载旧文件：

```json
{
  "owner/repo#1": {
    "dev": {
      "preScript": "src/agent-prescripts/dev-workspace.ts",
      "owner": "owner",
      "repo": "repo",
      "issueNumber": 1,
      "worktreePath": "...",
      "preparedFromMessageIndex": 3
    }
  }
}
```

新增 issue workspace 状态时应避免破坏旧 role context。实现可采用 versioned state file，也可在旧 issue entry 下保留一个受控保留键；但必须满足：

- 存量旧文件可直接加载。
- 并发保存不同 issue 的 workspace context 不互相覆盖。
- 并发保存 workspace context 与 role context 不互相覆盖。
- 状态只写 `.state/agent-contexts.json`，不得写入 `agents/`。
- issue workspace context 至少记录 owner、repo、issueNumber、worktreePath、preparedFromMessageIndex、workspaceAccess producer、是否由 legacy dev context 迁移、mainStatus 或最近检测时间。

如果采用 versioned state file，loader 必须同时支持 legacy shape 与新 shape；observer 读到新 shape 时可以继续以只读诊断展示，不在本任务改观察页 UI。

### 4. runner 集成与 prompt context

runner 在选中 agent 且 prompt plan 需要执行后：

1. 解析 `AgentManifest.workspaceAccess`。
2. 有 workspaceAccess 时调用内置 issue-worktree capability。
3. capability 失败时按 preScript 失败同类路径处理：不调用 Codex、不发 agent 评论、不更新 role thread，intake 进入既有 failed / retry / dead-letter 机制。
4. 成功后把返回的 `codexCwd` 传给 Codex。
5. 把 workspace prompt context 附加到 agent prompt，至少包含：
   - workspace path
   - access mode
   - `read-run` 行为约束
   - main status：fresh / behind-main / unknown
   - 若为 legacy migration，说明路径来自旧 dev context，未搬迁也未重建

`read-run` 不是 runtime sandbox。runner 不尝试用文件系统权限阻止写入；约束由 prompt、persona、验收证据和 GitHub 时间线审计承担。若 read-run 角色需要生成验收截图，仍按现有 artifact 引用契约放在 worktree 内并在评论「验收证据」显式引用。

### 5. 重建策略修订

删除旧的“复用 worktree 时 main 前进即强制删除并重建”语义。新语义：

- 首建必须基于最新 origin/main。
- 复用必须刷新 remote main 并检测是否前进。
- main 前进只作为状态暴露，不触发 destructive action。
- worktree 缺失、repo cache 缺失、context path mismatch 仍 fail closed；不做自动重建，避免误删进行中工作。
- 若未来需要显式 rebase/recreate，需要单独 issue 与人工确认，不混入 T5。

这会修改当前 `openspec/specs/github-issue-runner/spec.md` 中 dev 专属 worktree 与 stale rebuild 规则。

### 6. 首批角色 persona 纪律

- dev：写代码、测试、提交仍按现有开发纪律；workspace 是 issue 级共享资源，不再是 dev 私有目录。
- qa：方案阶段仍不写实现代码；当被安排做 live walkthrough 或代码验收时，可在 read-run worktree 内跑测试、起服务、截图并输出真实发现。T5 不改变 qa no-playbook 结论行规则。
- product-manager / hermes-user：代码验收阶段可在 read-run worktree 内执行验收语句、查看截图或起服务，但不得有意修改源码、提交或推送。
- dev-manager、ceo、secretary：不获得 issue worktree capability；secretary 仍固定当前仓库根目录。

### 7. 测试与验证设计

必须落地单元 / 集成测试，因为本任务含可测逻辑、状态迁移和跨模块契约：

- agent manifest：合法 / 非法 `workspaceAccess` 解析；`workspaceAccess` 不被当作 preScript 路径。
- issue-worktree 首建：新 issue 创建去 role 化 worktree path 与 branch，并从 `refs/remotes/origin/main` 建立。
- 共享语义：同 issue 的 dev、qa、product-manager、hermes-user 获得同一个 `codexCwd`；不同 issue 仍隔离。
- 懒迁移：只有 legacy dev context 时，qa 或 dev 首次 workspaceAccess 触发会创建 issue workspace context 指向原 dev worktreePath，不搬迁、不重建、不删除。
- main 前进：复用时 `isGitAncestor` 返回 false 不调用 removeWorktree、不调用 worktree add，只返回原路径并标注 main 前进。
- 有界失败：注入永不 settle 的 `git fetch` / `merge-base`，workspace prepare 在配置超时内失败，不调用 Codex、不更新 role thread。
- lock 释放：同 repo issue A 的 git 调用永久挂起并超时后，issue B 的 workspace prepare 能继续进入并完成或失败，不被 repo lock 永久阻塞。
- 失败路径：worktree 缺失、repo cache 缺失、context path mismatch fail closed。
- runner：workspaceAccess 成功时 Codex cwd 与 promptContext 传入；失败时不调用 Codex、不更新 role thread。
- persona/frontmatter：首批四个角色声明正确，非首批三个角色不声明 workspaceAccess。
- 外部正式验收：保留 tranfu-agents-app issue 96 live-walkthrough。clone/install/start/auth 等步骤必须用有界命令或受 Codex run watchdog 约束；若外部 repo 启动、权限或命令超时阻塞，最终 code-verified 必须明示卡点，不能把模拟测试伪装成真实重演通过。

## 权衡

- 不做 OS 级只读隔离：product-manager 已确认 read-run 是协作约束。真正强隔离会引入 worktree overlay、容器或权限模型，超出 T5 且会增加本地环境差异。
- 不自动 merge/rebase：main 前进并不等于当前 issue worktree应该被改写。自动 merge/rebase 仍可能污染验收现场或制造冲突处理副作用。
- 不搬迁 legacy dev worktree：迁移物理目录会碰到未提交改动、branch 占用、artifact 路径和用户排查上下文。懒迁移指向原路径能保住进行中工作。
- 不把 workspace 状态放进 goal-ledger：worktree 是 runner 执行资源，不是目标 / 阶段事实；继续放在 `.state/agent-contexts.json` 更符合现有模块边界。
- 不把 qa no-playbook 结论行规则塞进 T5：它是 persona / 剧本分发规则问题，product-manager 已确认只在非目标写清。

## 风险

- read-run 角色可能无意生成源码改动。缓解：prompt context 与 persona 明确禁止有意修改源码、提交、推送；最终验收可用 `git status --short` 暴露真实状态。
- 懒迁移后旧路径仍含 `__dev` 和旧 branch 名，短期不够漂亮。缓解：这是有意兼容口径；新 issue 才使用去 role 化路径与分支。
- issue workspace context 新 shape 可能影响 observer 只读展示。缓解：loader 保持兼容，observer 本任务不改 UI；若只读页面展示降级为诊断，不影响 runner 主链路。
- main 前进不自动更新 worktree 可能让长期 issue 基线变旧。缓解：这是保护进行中工作的核心目标；需要更新基线时应通过后续显式流程处理。
- 外部 tranfu-agents-app issue 96 重演可能受权限、依赖、端口或目标 app 状态阻塞。缓解：本任务同时要求本仓库模拟测试；真实重演失败时必须报告具体卡点，不得声称通过。
- 超时过短可能误杀慢网络 clone/fetch；超时过长会降低故障收敛速度。缓解：配置集中在 `src/config.ts`，默认取保守值，并通过测试覆盖 timeout 语义而不依赖真实等待。
