# 里程碑 4：默认本地对话操作台

> **状态：已裁决放行，进行中（2026-07-09）。** 各任务验收语句以本文档各任务「验收场景」为基线，由 dev 方案 + qa 审查按 `docs/roadmap/milestone-standards.md` 逐条细化增补。依赖序：T1 独立、可与 T2 并行；T2 为风险优先 spike，gate 住 T3+；T5 为终点线，T6 收尾。
> **与 M3 遗留卡点的关系：** M3 T9/T10 回流的卡点 A–K 是 runner 稳定性 / 编排维度，与本里程碑（对话介质本地化）正交，不在本里程碑范围，另行承接。

## 背景

整个运行时是围绕 GitHub issue 轮询搭起来的，GitHub issue 同时扛三重身份：**输入操作台**（人在评论区发指令、@ 角色）、**agent 交棒总线**（角色接力靠评论传递、runner 轮询扫描）、**留痕层**（过程与验收锚在评论上）。

由此带来的病灶：反馈是分钟级异步（要等心跳轮询，`eyes` reaction 是唯一即时反馈）；codex 运行期在 GitHub 上完全不可见，中断只能靠发新评论旁敲；协议格式（一条消息一个 mention、`N. 通过 — 依据`）硬存在只因界面是纯文本评论区；人要在「观察页看全局、GitHub 做操作」两套心智间切换。本地观察页只是补丁——只读、无操作权。`conversation-console` change 已把本地对话操作台的页面设计做完，但零代码、无数据流，缺一条真正的本地链路才能落地。

本里程碑把**默认的监听与响应从 GitHub 迁到纯本地**，GitHub 的监听/响应降级为互斥的启动 flag 模式（过渡与回退用）。

## 核心设计立场（先行固化）

- **核心链路 source-agnostic，只在最外圈加 adapter**：`conversation`（共享时间线）/ `trigger`（mention）/ `codex` / CEO guardrail / `goal-ledger` 一行不动；在 runner 外圈引入 `input intake adapter` + `response sink adapter`。GitHub 收敛为「第一个 adapter」，本地 adapter 做默认。这不是新增一层水平工程，而是把已有 GitHub 耦合抽成可替换的边界。
- **会话取代 issue 作基本单元**：本地一个「会话」= 一条共享时间线 + 一个目标账本 + 验收载体，对应现在一个 issue 的三重角色；`goal-ledger` / role-thread 挂到会话 key 上。对普通用户不暴露 issue 这个机器术语。
- **SQLite 统一持久化，废弃 `.state` JSON**：会话时间线 + 会话树 + 现有 `role-threads` / `goal-ledger` / `intake` / `agent-contexts` 全部落一个 SQLite 库；单写者约束用事务保证。
- **本地与 GitHub 互斥切换，数据不互通**：默认 local；启动参数切纯 GitHub，二选一不并存。本地留痕在 SQLite，GitHub 留痕仍在评论，各存各的、不镜像。
- **runner 与 UI 解耦，中间一条本地通道**：桌面台（`console-ui`）是这条通道的首个客户端，可连可断、崩了重连不丢活（codex 是 5 并发长任务，绝不能绑死 UI 生命周期）；headless / CLI 是同一通道的附带能力。MVP 阶段 runner 继续作为 Electron `utilityProcess` 子进程，只多暴露一条通道。
- **GitHub 专属语义换本地原生形态，不做 1:1 映射**：`eyes` reaction 只因 GitHub 分钟级异步才存在，本地有运行直播 → 落成「已收到 / 运行中」即时态；dead-letter → 本地错误记录；intake `updatedAt` 游标 → 通道位点 / 改推送免轮询。判据：本地模式下各种状态的展示与交互**完备**。
- **交棒总线 / CEO 兜底跟着时间线走**：二者 source-agnostic，时间线一本地化就自动本地化，不单列为独立工程。

## 成功标准（里程碑级）

不配置任何 repository、不做 `gh auth`，`pnpm start` 与桌面壳都能起；一个真人用户从桌面台入口发起一个真实多角色协作目标，完整走过：**本地发消息 → 命中 mention → codex 运行（过程直播、可中断）→ 回复落本地时间线 → ceo + qa + dev-manager + dev 在纯本地完成一轮方案链 → 验收在本地完成**；全程状态（进行中 / 等待 / 卡住 / 错误）在桌面台完备可见。同一套能力在 GitHub 模式下仍可用（互斥切换），两模式数据不互通。

质量基准：终点（对等补齐）为 `成品级`——本地模式对 GitHub 模式**全功能对等**，不是 demo。

## 任务清单（粗粒度，验收语句待细化）

> 排序为风险优先 + 逐级抬升质量基准。每个任务是一条能被角色端到端验收的垂直切片，不是水平工程层。

### - [x] T1 · CEO 默认走方案链、拆分只在明确表达时触发（`数据正确级`）

独立可先落的垂直切片（跑在当前 GitHub 运行时，与后续本地化正交）。**问题**：goal-intake 拆分不稳定；且「默认拆分」是机制层硬约束——`src/agent-prescripts/ceo-ledger-context.ts` 在 intake bootstrap（无 active phase）时注入「只能用 goal-intake 工作流」，TS 校验拒绝非 goal-intake 输出，**只改 `agents/ceo.md` 改不动这条闸**。**目标**：一个目标形状的新会话默认走 `ceo + qa + dev-manager + dev` 方案链（dev 出方案 → qa 审 → 验收），goal-intake 拆分只在用户**明确表达拆分 / 编排意图**时触发。

范围（碰机制，非纯 md）：放宽 `ceo-ledger-context.ts` 的 bootstrap 判据（无明确拆分意图时允许路由到方案链）+ 收紧 `agents/ceo.md` 兜底路由 / 目标入账判据 + `goal-ledger` / `github-issue-runner` spec-delta + 测试。

验收场景（细化时保留）：在 issue 里只写目标形状「我想做一个 X」（无明确拆分意图）→ 应看到 CEO 路由到方案链、不进 goal-intake 拆子 issue；在 issue 里明确写「把这个拆成多个任务并行做」→ 才应看到 goal-intake 采访 / 提案 / 拆分。

验收证据（2026-07-09）：实现引入 `default-plan-chain` CEO 剧本，放宽 `src/agent-prescripts/ceo-ledger-context.ts` 的 bootstrap 判据，并收紧 `agents/ceo.md` 中普通目标与明确拆分意图区分。product-manager 已按 5 条正式验收语句逐条验收通过；复跑 `pnpm test -- tests/runner.test.ts tests/ceo-ledger-context.test.ts tests/ceo-scripts.test.ts tests/ceo-orchestration.test.ts` 退出码 0（4 个文件、110 个测试通过），补充复核 `pnpm test` 退出码 0（根 33 个文件、381 个测试；desktop 5 个文件、15 个测试；console-ui 2 个文件、6 个测试）、`pnpm typecheck` 退出码 0、`git diff --check` 退出码 0。runner 级 spy 已覆盖普通目标 route handoff 后不创建 child issue、不写 goal ledger、无 mention 普通目标两轮 fallback、明确拆分路径只写 pending ledger 且不强制 `default-plan-chain`。

### - [x] T2 · 本地端到端最小闭环（风险优先 spike，`demo 级`）

消除本里程碑最大不确定性：**纯本地通道能否替代 GitHub 做输入源 + 输出汇，同时核心链路照常工作**。一条最小垂直叙事——真人在最小本地界面发一条带 mention 的消息 → runner 经 local intake adapter 拾取 → codex 跑 → 回复经 local sink 落回本地并显示。允许其他能力假实现（无会话树、无持久化、单会话、UI 极简），但 adapter 边界 + 本地通道 + 最小 SQLite 消息表这条端到端路径不得断。

验收场景（细化时保留）：不配 repository、不 `gh auth` 启动 → 在最小本地界面发「@dev 帮我写个 hello」→ 应看到 codex 真实运行并把回复显示在本地界面，全程无任何 GitHub 调用（fake `gh` 零调用）。

验收证据（2026-07-09）：T2 已按 `openspec/changes/local-console-t2-e2e-spike/` 实现最小本地 HTTP + SQLite + local intake/sink + Codex 闭环；真实本地运行截图见 `artifacts/acceptance/local-console-t2.png`，Codex 输出摘要见 `artifacts/acceptance/local-console-codex-output-summary.txt`，本地消息快照见 `artifacts/acceptance/local-console-snapshot.json`，验收环境摘要见 `artifacts/acceptance/local-console-acceptance-environment.txt`，fake `gh` 零调用日志见 `artifacts/acceptance/local-console-fake-gh.log`（0 bytes）。自动化回归：`pnpm vitest run tests/local-console.test.ts`、`pnpm typecheck`、`pnpm test` 均通过。

### - [x] T3 · SQLite 统一持久化 + 会话作基本单元（`数据正确级`）

把 T1 的假持久化换成真实：会话时间线 + 会话树 + `role-threads` / `goal-ledger` / `intake` / `agent-contexts` 全部落 SQLite，废弃 `.state` JSON；GitHub 模式的既有持久化行为**零漂移**（behavior-preserving，回归靠现有 GitHub 全测试仍绿）。会话取代 issue 作 key。

验收场景（细化时保留）：本地跑一轮对话后重启桌面壳 → 应看到会话历史、role thread、账本状态完全一致；跑现有 GitHub 全测试套件 → 应全绿，无行为差异。

验收证据（2026-07-09）：T3 已按 `openspec/changes/local-console-t3-sqlite-persistence/` 实现统一 SQLite state store、GitHub deterministic session key、legacy `.state/*.json` source-local migration marker、worker-isolated SQLite timeout、只读 observer state loader，以及 local console `session_messages` 重启一致性。正式 8 条验收映射见 `artifacts/acceptance/t3-sqlite-persistence.md`。自动化回归：`pnpm vitest run tests/agent-context-state.test.ts tests/github-intake-state.test.ts tests/goal-ledger-state.test.ts tests/observer.test.ts tests/runner.test.ts tests/issue-worktree.test.ts tests/dev-workspace.test.ts` 退出码 0（7 个文件、143 个测试通过）；`pnpm vitest run tests/state.test.ts tests/sqlite-state.test.ts tests/local-console.test.ts` 退出码 0（3 个文件、16 个测试通过）；`pnpm typecheck` 退出码 0；`pnpm test` 退出码 0（根 35 个文件、393 个测试，desktop 5 个文件、15 个测试，console-ui 2 个文件、6 个测试）；`git diff --check` 退出码 0。

### - [x] T4 · 桌面台成为完备操作台（`数据正确级`）

`console-ui` 从「只设计」升为订阅本地通道的真客户端：项目 → 会话两层导航、单时间线多角色混排、codex 运行过程直播、可中断、状态（进行中 / 等待真人 / 卡住 / 错误）完备可见。GitHub 专属语义在此落成本地原生形态（即时态 / 本地错误记录）。

验收场景（细化时保留）：桌面台发起一次对话 → 应看到运行直播；运行中点中断 → 应看到本轮 codex 被停下且状态如实反映；构造一个失败 → 应看到本地错误记录而非静默。

验收证据（2026-07-09）：T4 已按 `openspec/changes/archive/2026-07-09-local-console-t4-desktop-operator-console/` 实现并归档；验收截图见 `artifacts/acceptance/t4-live.png`、`artifacts/acceptance/t4-interrupted.png`、`artifacts/acceptance/t4-failed.png`，8 条正式验收的 API / SQLite 摘要见 `artifacts/acceptance/t4-evidence.json`。该 JSON 逐条记录 live run 的 `lastOutputSummary` / `runDir` / `elapsedMs`、interrupted 状态和释放后续消息、failed `exit:42` 本地错误、bounded tail `tail-truncated:stdout.jsonl` 与有界 poll、空输出 fallback `正在运行，等待输出`、跨会话错误中断 409 与正确中断 202、stuck `idle-timeout:10ms`、重启后 interrupted / failed / stuck 恢复。自动化回归：`pnpm exec tsx scripts/acceptance/local-console-t4.ts`、`pnpm test`、`pnpm typecheck`、`pnpm --filter @agent-moebius/desktop build`、`pnpm --filter @agent-moebius/console-ui test` 均退出码 0。

### - [x] T4.5 · 多角色接力循环打通（`数据正确级`）

打通 local intake 侧的 agent handoff 总线：agent 回复落库后同一事务推进 SQLite 消息位点，并立即在同一 session drain 中把该 agent 消息作为下一轮可 claim 触发源继续走 `resolveTrigger`；启动只做一次 catch-up，不再靠 1s 周期 poll 兜底。GitHub 模式保持零漂移，不改 `runner.heartbeat` / GitHub intake。

验收场景（细化时保留）：在纯本地发一条「@ceo 我想做 X」→ 应看到 ceo → dev-manager → dev → qa 四条 agent 消息在秒级接力落库，任意两条相邻消息之间不再引入 1s+ 轮询等待、只受限于 codex 单轮真实运行时长；中途 `kill` runner 后重启 → 应看到未处理完的接力从断点续跑，不重复也不丢棒；GitHub 全测试套件仍全绿。

验收证据（2026-07-09）：T4.5 已按 `openspec/changes/local-console-t45-handoff-loop/` 实现 local session drain、SQLite `local_message_cursors` 位点、agent 回复作为下一轮触发源、启动 catch-up 与无 1s 周期 poll。正式 7 条验收摘要见 `artifacts/acceptance/t45-evidence.json`：四角色链路落库顺序与 run 顺序均为 `ceo -> dev-manager -> dev -> qa`，相邻 handoff gap 为 298ms / 289ms / 293ms，重启续跑只运行剩余 `dev` 一棒且 agent roles 为 `ceo, dev`，`recordAgentResponse` 事务前失败后无半条 agent 回复且 retry 后成功，timeout 产生 visible `stuck` 记录并允许后续 `qa` 消息继续，两个 session startup catch-up 中 fast session 不被 slow session 阻塞。自动化回归：`pnpm exec tsx scripts/acceptance/local-console-t45.ts`、`pnpm vitest run tests/local-console.test.ts`、`pnpm test`、`pnpm typecheck`、`git diff --check` 均退出码 0。

### - [ ] T5 · 本地全功能对等（终点线，`成品级`）

拿 `github-issue-runner` spec 的 MUST 清单逐条核，把 GitHub 模式全部能力在本地补齐原生形态：交棒总线、CEO 无 mention 兜底路由、验收走查、开子会话编排（CEO「开子 issue」→「开子会话」）、dead-letter 降级。漏一条即未达终点。

验收场景（细化时保留）：在纯本地发起一个多子任务目标 → 应看到 CEO 兜底路由、按会话拆子会话、qa 走查、验收回流全部在本地跑通，与 GitHub 模式行为对齐；逐条比对 spec MUST 清单无遗漏。

### - [ ] T6 · GitHub 降为互斥 flag 模式 + 收尾（`成品级`）

默认 local；启动参数切纯 GitHub 模式，二选一、运行时不并存、数据不互通。事实源收尾：`github-issue-runner` spec 中观察页 / GitHub 呈现类规格迁移到新业务域（如 `local-console`）；`docs/wireframes/pages/observer.md` → `pages/console.md` + `flow.md` 同步；AGENTS.md 更新启动形态。

验收场景（细化时保留）：默认启动 → 走本地不碰 GitHub；带 flag 启动 → 走 GitHub 不碰本地库；两模式数据互不可见。

## 非目标

- 不动核心链路（conversation / trigger / codex / guardrail / goal-ledger）的业务语义，只换输入输出介质与持久化载体。
- 不做本地与 GitHub 双通道并存、不做两模式数据互通 / 镜像。
- 不承接 M3 遗留卡点 A–K（runner 稳定性 / 额度 / 编排维度），那是正交 track。

## 启动条件

本文档任务经细化（补齐验收语句、范围、依赖）并获用户裁决；T1（CEO 方案链默认）可独立先落于当前 GitHub 运行时；T2 作为本地化风险优先 spike，其结论回流细化 T3–T6。
