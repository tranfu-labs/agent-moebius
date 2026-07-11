# 设计：github-mode-startup-flag

## 方案

本方案把启动形态作为 runtime composition concern 处理：入口先解析 mode，再只启动对应 runtime。核心业务模块保持原有边界，避免把 local-console 行为写进 GitHub runner，或把 GitHub issue runner state 混进 local session store。

### 1. Runtime mode parser

新增窄解析模块或函数：

```ts
export const GITHUB_MODE_FLAG = "--github-mode";
export type RuntimeMode = "local" | "github";

export function resolveRuntimeMode(argv: readonly string[]): RuntimeMode {
  if (argv.length === 0) return "local";
  if (argv.length === 1 && argv[0] === GITHUB_MODE_FLAG) return "github";
  throw new Error(`Unknown startup arguments: ${argv.join(" ")}`);
}
```

约束：

- 只接受 exact `--github-mode`。
- `--github-mode=1`、`--githubmode`、未知参数、重复参数都 fail fast。
- fail fast 发生在启动 local server 或 GitHub heartbeat 之前，满足 V1：运维 typo 不会静默进入错误模式。

### 2. Unified runtime handle

把当前 `start(): Promise<NodeJS.Timeout>` 改成统一句柄：

```ts
export interface StartedRuntime {
  mode: RuntimeMode;
  close(): Promise<void>;
}
```

建议实现：

- `startLocalMode(deps)`：调用 `startLocalConsoleServer()`，返回 `close()` 时关闭 server/runtime。
- `startGitHubMode(deps)`：复用当前 GitHub runner 启动顺序：`loadGitHubResponseIntakeState()` → `createRunner()` → 首轮 `heartbeat()` → `setInterval()`；`close()` 清理 interval，并等待 dispatcher idle / persister flush 的 best-effort 收尾。
- `start({ mode = resolveRuntimeMode(process.argv.slice(2)), deps })`：按 mode 分支。

启动日志必须记录 mode，便于 babysit runner 运维确认当前命令实际进入 GitHub mode。

### 3. Local mode path

local mode 只启动 local console server：

- 不调用 `loadGitHubResponseIntakeState()`。
- 不调用 `createRunner()`。
- 不触发 `runIntakeScan()`。
- 不调用 `listOpenIssueSummaries()` 或 `fetchIssueWithComments()`。
- 不要求 `gh auth login` 才能启动 local console。

验收 harness 使用 fake GitHub adapter：任何 GitHub issue list/view 调用都抛错；默认 local 启动 3 秒内 local server 可用且 fake GitHub issue 调用计数为 0。

### 4. GitHub mode path

GitHub mode 只启动 GitHub runner：

- 不调用 `startLocalConsoleServer()`。
- 不创建 local console runtime。
- 不写 `session_messages`、`local_message_cursors`、`local_route_decisions`、`local_dead_letters`、`local_workspace_diffs` 等 local session/runtime 表。
- 继续复用 scanner、dispatcher、driver pool、Codex watchdog、GitHub CLI timeout/retry、CEO guardrail、artifact publishing、issue worktree 等既有 GitHub runner能力。

为了覆盖 L1，GitHub-mode wrapper 不能在启动前等待 local console server 或 local SQLite store；测试把 local server/store 注入为永久挂起或抛错，GitHub heartbeat 仍应按既有有界路径启动或返回可见失败。

### 5. State isolation

QA 指出当前 `src/github-intake-state.ts`、`src/state.ts`、`src/agent-context-state.ts`、`src/goal-ledger-state.ts` 经 `sqlitePathForLegacyStateFile()` 可能把 GitHub runner state 写入 `.state/local-console.sqlite`。本 change 必须明确分离：

- local console session/runtime store：继续使用 `.state/local-console.sqlite`，承载 local projects、sessions、session_messages、local cursors、local T5 facts 等。
- GitHub runner state store：选定 `.state/github-runner.sqlite`，由 `github-state-store.ts` 统一解析路径和迁移；不能和 local session store 共用 SQLite 文件。legacy JSON 仍作为一次性迁移输入，不再作为新写入目标。

选型时优先最小 diff 与可测性，但必须满足：

- local API / local T5 facts 查询不到 GitHub intake、role-thread、ledger 事实。
- GitHub runner state loader 不读取 `session_messages`。
- 同一次 `start()` 只打开当前 mode 需要的 state channel。
- 同一数据根下历史文件可以同时存在，但不能被当前 mode 互相读取或镜像；这里的“不并存”定义为同一启动流程不并发启用两条 runtime 写入链路。

### 6. GitHub state split migration

为了满足“不破坏现有 GitHub runner 行为”，state store 拆分必须包含一次有界迁移：

- 迁移输入：
  - 当前共用 `.state/local-console.sqlite` 中的 GitHub runner state 表：`github_intake_repositories`、`github_intake_issues`、`session_role_threads`、`session_agent_contexts`、`goal_ledger_documents`。
  - 仍存在的 legacy JSON state files：`.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json`、`.state/goal-ledger.json`。
- 迁移输出：
  - GitHub-mode 专属 state channel，例如 `.state/github-runner.sqlite` 或 JSON GitHub state files。
- 禁止迁移：
  - `projects`、`sessions`、`session_messages`、`local_message_cursors`、`local_route_decisions`、`local_acceptance_facts`、`local_integration_events`、`local_dead_letters`、`local_workspace_diffs` 等 local console runtime/session tables。
- 顺序：
  - `startGitHubMode()` 必须先完成 GitHub runner state split migration，再加载 GitHub intake state，再启动 heartbeat / scan。
  - `startLocalMode()` 不执行 GitHub state split migration。
- 幂等：
  - 迁移成功必须记录 source / digest / timestamp 或等价 marker。
  - 再次 GitHub mode 启动不能重复导入，不能覆盖 GitHub-mode channel 中更新的 state。
  - 如果 GitHub-mode channel 已有更新 state，legacy source 只能作为缺失 state 的一次性来源，不能回灌覆盖。
- 失败路径：
  - 迁移读写失败、schema 不合法、超时或目标 channel 存在未标记冲突 state 时，GitHub mode 必须在扫描前 fail fast。
  - 失败时不得 silent rebaseline，不得推进 intake cursor，不得启动 local runtime。
  - 迁移 IO 必须使用既有有界 SQLite timeout / busy timeout 或显式 AbortSignal，避免 L1 永久等待。

测试必须覆盖：

- 当前格式 `.state/local-console.sqlite` 同时含 GitHub runner 代表记录和 local session 代表记录时，首次 GitHub mode 只迁移 GitHub runner state slice。
- 迁移失败或超时在扫描前可见失败，GitHub issue list/view adapter 调用次数为 0。
- 迁移成功后第二次 GitHub mode 启动不重复导入、不覆盖较新的 GitHub-mode state。

### 7. Desktop child

桌面 main process 已经启动 local console server，并通过 preload / local URL 给 renderer 使用。默认终端翻 local 后，desktop runner child 必须显式 GitHub mode：

- 方案一：`desktop/src/runner-child.ts` 调用 `start({ mode: "github" })`。
- 方案二：`desktop/src/main.ts` fork runner child 时传 argv `["--github-mode"]`，runner-child 透传给 `start()`。

推荐方案一，因为 child 本身就是内部装配点，可直接表达意图；测试可静态或单元断言。

### 8. Tests

正式验收清单为原三条、需求侧确认的四条 QA 增补和 roadmap 新增的干净环境 local 冷启动检查：

- Parser：`[]` local；`["--github-mode"]` github；`["--github-mode=1"]` / `["--githubmode"]` / unknown fail fast。
- Local startup：临时数据根 + fake GitHub issue adapters 一调用即失败；启动 local 后 fake GitHub issue read/list 计数为 0，GitHub intake loader 计数为 0。
- Clean local startup：不配置 repository、不提供 gh auth，启动真实 local console server；断言正常监听并只创建 local console SQLite。
- GitHub startup：local server/store 注入 hang/fail；GitHub heartbeat factory 被调用，local server/store 调用计数为 0。
- State isolation：在同一临时数据根分别写 local session message 和 GitHub intake/role-thread/ledger representative record；断言各自 loader/API 只读自己的 channel。
- State split migration：预置当前共用 `.state/local-console.sqlite`，其中含 GitHub intake、role thread、agent context、goal ledger 代表记录和 local session 代表记录；首次 GitHub mode 启动只迁移 GitHub runner state slice，local session 记录不可见且不被镜像。
- Migration failure：注入迁移失败或超时；GitHub mode 在扫描前可见失败，不 silent rebaseline，不推进 intake cursor，不启动 local runtime。
- Migration idempotency：迁移成功后再次 GitHub mode 启动，不重复导入、不覆盖较新的 GitHub-mode state。
- Desktop child：断言 child 使用 `{ mode: "github" }` 或 fork argv 含 `--github-mode`。
- Regression：`pnpm test`、`pnpm typecheck`、`git diff --check`；如触碰 desktop，跑 `pnpm --filter @agent-moebius/desktop build`。

## 权衡

- 不把 unknown flag 当 local：会让 typo 早失败，避免 babysit runner 静默停扫。
- 不用 `AGENT_MOEBIUS_DISABLE_LOCAL_CONSOLE` 做公开契约：终端运维命令必须是 `pnpm start -- --github-mode`，桌面 child 则通过共享常量显式选择 GitHub mode。
- 不要求同一数据根历史文件互斥不存在：需求同时要求两模式各写代表数据，所以物理文件可共存；真正要保证的是当前 mode 不读/写/镜像另一个 mode 的 runtime 数据。
- 把 GitHub state store 隔离纳入本 change：这比单纯改启动 flag 多一点，但它是验收语句 3 的必要条件，否则 GitHub runner state 与 local SQLite 会话链路会在同一 SQLite 文件里混淆。

## 风险

- GitHub state store 分离可能影响 observer 读取 legacy state。缓解：方案要求同步现有 runtime 说明和必要 observer/state loader 测试；如果 observer 仍需读 GitHub runner state，应读 GitHub-mode state channel，而不是 local session tables。
- `start()` 返回类型变化会影响 desktop child shutdown。缓解：统一 `StartedRuntime.close()`，SIGTERM/SIGINT 调用 close。
- GitHub mode startup 如果首轮 heartbeat 内部失败，应沿用现有 failed/retry/dead-letter 语义；mode wrapper 不吞错误、不推进 intake。
- Local mode 若 local console server 启动失败，应可见记录并关闭，不 fallback 到 GitHub mode；避免“local 起不来就误扫 GitHub”。
