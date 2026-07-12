# 里程碑 4：默认本地对话操作台

> **状态：已裁决放行，进行中（2026-07-09；2026-07-11 增补 T6.5 / T8 并修订 T7 验收）。** 各任务验收语句以本文档各任务「验收场景」为基线，由 dev 方案 + qa 审查按 `docs/roadmap/milestone-standards.md` 逐条细化增补。依赖序：T1 独立、可与 T2 并行；T2 为风险优先 spike，gate 住 T3+；T4.5 gate 住所有多角色接力场景（含 T5 的交棒总线 / 走查 / 开子会话）；T4.6 gate 住 T5 的 workspace 隔离对等；T5 为功能终点线，T6 视觉锚归位（组件库扁平化 + 主界面回收组件），T6.5 兑现 conversation-console 复合组件设计（与 T7 不同文件、可并行），T7 收尾，T8 为里程碑关闭的硬性 gate（真人 + 真实 codex 终点验收）。
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

### - [x] T4.6 · 本地 project 层 + workspace source（`数据正确级`）

T4 已把 UI 层 `OperatorProject / OperatorSession` 双层骨架建好（`packages/console-ui/src/console/operator-console.tsx`），但物理层 project 概念仍不存在：codex 的 cwd 写死为单一 `runtime.options.projectRoot`（`src/local-console/runtime.ts:199`），`sessions` 表没有 project 外键，桌面壳没有「选文件夹」入口，也没有 worktree 开关。T5 终点线的「隔离/回滚语义与 GitHub 对等」直接依赖本任务。

范围：桌面壳新增「打开文件夹」作为 project 的物理载体，project 落 SQLite（新 `projects` 表 + `sessions.project_id` 外键），`OperatorProject` 从占位升级为真实数据；新增第三个 adapter `workspace source`——GitHub=`cloneUrl`，本地=`{folderPath, worktreeMode}`，codex 的 cwd 由此 adapter 解析：git 目录 + worktree 开启 → 临时 worktree（基于本地 HEAD，尽量复用 `src/agent-prescripts/issue-worktree.ts` 主体路径）；git 目录 + 关闭 → 原目录；非 git 目录处理策略在细化阶段拍板（候选：引导 `git init` / 原地跑 / 拒收）。会话树 `parent_session_id` 写入不在本任务范围（归 T5）。

验收场景（细化时保留）：(a) 打开一个 git 目录、worktree 开关开 → dev 在临时 worktree 改、原目录 `git status` 无脏改；(b) 同一目录关掉开关 → dev 直接在原目录改；(c) 打开非 git 目录 → 走细化时拍板的处理路径；(d) 重启桌面壳 → 应看到 project 列表和上次一致，`OperatorProject.title` 反映真实目录名；(e) 全程 fake `gh` 零调用。

验收证据（2026-07-10）：T4.6 已按 `openspec/changes/archive/2026-07-12-local-console-t46-project-workspace-source/` 实现本地 project 持久化、workspace source resolver、桌面打开文件夹入口、worktreeMode 开关和 UI 真实 project 列表。正式 9 条验收摘要见 `artifacts/acceptance/t46-evidence.json`：git 目录 worktree 开启时 Codex cwd 为 `workdir/local-worktrees/...` 且原目录 `git status --short` 为空；同目录关闭 worktree 后 Codex cwd 回到原目录且原目录出现 `?? codex-2.txt`；非 git 目录原地运行且 `worktreeUnavailableReason=not-git-repository`、未创建 `.git`、fake `gh` 调用为 0；重启后 project id 列表一致且 title 为真实目录名；fake git timeout 记录可见 `workspace-git-timeout:rev-parse:100ms`、`activeRunAfterFailure` 为 `null`，同 session 后续消息可继续；旧 SQLite fixture 迁移保留 message/cursor/runDir/error 且非法 projectId 不写半条 session；folderPath 删除后 project row 与 timeline 保留，其他 project/session 仍可运行；folder picker IPC 使用 `dialog.showOpenDialog` 且 handler 不包含 `gh`。自动化回归：`pnpm exec tsx scripts/acceptance/local-console-t46.ts`、`pnpm vitest run tests/local-console.test.ts`、`pnpm test`、`pnpm typecheck`、`pnpm --filter @agent-moebius/desktop build`、`pnpm --filter @agent-moebius/console-ui test` 均退出码 0。

### - [x] T5 · 本地全功能对等（终点线，`成品级`）

拿 `github-issue-runner` spec 的 MUST 清单逐条核，把 GitHub 模式全部能力在本地补齐原生形态：交棒总线、CEO 无 mention 兜底路由、验收走查、开子会话编排（CEO「开子 issue」→「开子会话」，含 `sessions.parent_session_id` 写入判定与写入路径）、dead-letter 降级、**workspace 隔离/回滚语义（T4.6 worktree 开启态）与 GitHub `issue-worktree` 路径对等——开分支、diff 回流、不污染原目录三点全等**。漏一条即未达终点。

验收场景（细化时保留）：在纯本地发起一个多子任务目标 → 应看到 CEO 兜底路由、按会话拆子会话（`parent_session_id` 落库并在桌面台侧栏正确渲染树形层级）、qa 走查、验收回流全部在本地跑通，与 GitHub 模式行为对齐；worktree 开启态下走一遍 dev 修改回流 → 与 `issue-worktree` 在开分支 / 回流 / 原目录洁净三点上行为全等；逐条比对 spec MUST 清单无遗漏。

子切片证据（2026-07-10，#112）：T5 本地验收走查 / 验收回流已按 `openspec/changes/archive/2026-07-10-local-console-t5-acceptance-loop/` 实现并归档。正式 2 条验收语句与 product-manager 确认接受的 QA 增补 5 条验收口径，汇总证据见 `artifacts/acceptance/t5-evidence.json` 的 `acceptance-loop-suite`：边界替换消除预 T5 acceptance 禁止冲突；通过走查写入 passed fact 并驱动 parent integration progress；格式错误写 visible reminder 且不保存 passed fact、不消费同消息 handoff；parent visible write 失败后 cursor / handoff / completed event 不被错误推进，retry 后只生成一个 deduped parent progress；先失败后复验通过保留 failed repair reference 并以 latest passed fact 驱动 rejoin；缺 formal acceptance statements 时 visible blocked 且不伪造范围；SQLite store timeout 后 session drain 释放且不保存成功验收事实。自动化回归：`pnpm exec tsx scripts/acceptance/local-console-t5.ts --case acceptance-loop-suite`、`pnpm exec vitest run tests/local-console.test.ts`、`pnpm typecheck` 均退出码 0；`pnpm exec openspec validate local-console-t5-acceptance-loop --strict` 在归档前退出码 0，归档后 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case boundary-replacement` 退出码 0。

验收证据（2026-07-10，#116）：T5 集成收尾按 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case all` 生成全量证据 `artifacts/acceptance/t5-evidence.json`，覆盖多子任务目标、CEO 兜底路由、`parent_session_id` 树、qa/product-manager 走查、父级集成回流、worktree diff 回流对等、dead-letter 降级、MUST 矩阵与 fake `gh` 零调用。MUST 矩阵以 `openspec/specs/github-issue-runner/spec.md` 当前 564 行含 `MUST`、475 行项目符号 `- MUST` 为口径，并由 `openspec/changes/local-console-t5-full-parity/proposal.md` / `tasks.md` 映射。自动化回归：`pnpm test` 退出码 0（root 35 文件 425 测试、desktop 5 文件 15 测试、console-ui 3 文件 10 测试）；`pnpm typecheck` 退出码 0；`pnpm --filter @agent-moebius/desktop build` 退出码 0；`pnpm --filter @agent-moebius/console-ui test` 退出码 0。T6 互斥 flag 与 M3 A-K 遗留卡点仍不在 T5 范围。

### - [x] T6 · console-ui 扁平锚归位（组件库对齐 Linear + 主界面回收组件，`成品级`）

**问题**：T4 建 `packages/console-ui/src/console/operator-console.tsx`（527 行）时除 `Button` 外几乎绕开了组件库——`RunLiveBlock`（第 348 行起）/ `TimelineMessage`（第 395 行起）/ `StatusBadge`（第 420 行起）三处用原生 `<article>` / `<div>` / `<span>` + tailwind 手撸重写了 `Card` / `Badge` 的等价形态；组件库里 `Card` 默认 `rounded-lg` + 浮起观感与项目视觉锚（conversation-console 对标 Linear 扁平语言：方角 / 细边 / 紧凑 / 纯色扁平按钮 / 阴影只留浮层）不符，是「作者绕开组件库」的直接诱因。**目标**：把组件库改到扁平锚一致，主界面回收组件，让 T5 #113 等后续 UI 增量默认在统一基线上生长，不再各处 tailwind 手撸。

范围：调 `packages/console-ui/src/ui/card.tsx` + `ui/badge.tsx` 默认样式与 Linear 扁平锚对齐（Card 去 `rounded-lg` 或改到扁平半径 / 只保留细边 / 无浮起阴影；Badge 变体从当前通用命名 `neutral / accent / pass / danger` 收敛到 status 语义 `running / failed / waiting / interrupted / idle` 等）；替换 `operator-console.tsx` 中 `StatusBadge` → `<Badge>`、`TimelineMessage` → `<Card>`、`RunLiveBlock` → `<Card>`；若 T5 #113 已把子会话树形渲染合入并在侧栏叠新的手撸样式，一并纳入回收。侧栏 project/session 导航按钮属导航语义、不属卡片/徽章，本任务不动。同一改动回归 `packages/console-ui/src/console/accept-card.tsx` 规范样例（它是组件库正确用法的活参考）、`console-ui` storybook 与 desktop 打包。

依赖：建议 T5 全部合入后启动，避免与 #113 树形渲染新增 UI 节点叠加返工；如需并行，可先跑「组件库 `Card` / `Badge` 扁平化」子步骤，主界面替换段等 T5 合入。

验收场景（细化时保留）：(a) 跑 `pnpm --filter @agent-moebius/console-ui storybook` → 应看到 Card / Badge 与主界面视觉一致，不出现「组件库偏浮起、主界面偏扁平」两套观感；(b) 打开桌面台会话页 → 应看到时间线消息、`RunLiveBlock`、状态徽章的圆角 / 边框 / 内边距与 `accept-card` 规范样例、Linear 扁平锚一致（方角 / 细边 / 紧凑）；(c) 在 `packages/console-ui/src/console/operator-console.tsx` 主内容区（`<main>` 及以内，除侧栏导航按钮外）跑 `grep -nE 'border border-line|<article'` → 应命中 0，卡片/徽章全部通过组件；(d) 跑 `pnpm --filter @agent-moebius/console-ui test`、`pnpm --filter @agent-moebius/desktop build`、`pnpm typecheck` → 应全绿；(e) 回归 `accept-card` 规范样例视觉与交互 → 应无回退。

验收证据（2026-07-10）：T6 已按 `openspec/changes/archive/2026-07-10-console-ui-flat-anchor/` 实现 console-ui 扁平锚归位：`Card` 默认方角细边无阴影，`Badge` 从旧 `neutral / selected / accent / pass / danger` 收敛为 status 语义，`operator-console.tsx` 主内容区的 RunLiveBlock / TimelineMessage / status labels 回收到 `Card` / `Badge`。视觉证据见 `artifacts/acceptance/t6-desktop-renderer.png`（desktop renderer 静态包 + fake local console state，覆盖 active RunLiveBlock、普通 TimelineMessage、running/pending/completed/displayed/failed/stuck/interrupted 状态 Badge）与 `artifacts/acceptance/t6-component-gallery.png`（Card / Badge / OperatorConsole-like timeline / AcceptCard-like surface 同一方角、细边、紧凑、无浮起阴影基线），结构化摘要见 `artifacts/acceptance/t6-evidence.json`。静态 gate：`rg 'variant="(neutral|selected|accent|pass|danger)"|variant: "(neutral|selected|accent|pass|danger)"' packages/console-ui/src` 命中 0；`rg 'StatusBadge|statusClass|<article|border border-line' packages/console-ui/src/console/operator-console.tsx` 命中 0，并已确认 RunLiveBlock / TimelineMessage 根容器来自 `Card`、状态标签来自 `Badge`。回归命令：`pnpm --filter @agent-moebius/console-ui test` 退出码 0（3 文件 10 测试，含 AcceptCard 与 OperatorConsole 回归）；`pnpm --filter @agent-moebius/desktop build` 退出码 0；`pnpm typecheck` 退出码 0；`pnpm exec openspec validate console-ui --type spec --strict` 退出码 0；`git diff --check` 退出码 0。

### - [x] T6.5 · 操作台复合组件按设计落地（兑现 conversation-console 设计，`成品级`）

**问题**：设计到实现的传递链在复合组件层断裂。`openspec/changes/conversation-console/`（ui-design.md / wireframes.md）把操作台页面设计做完且至今未归档（即从未被实现）；desktop-console-ui change（已归档 2026-07-09）只移植了 7 个 shadcn 原语 + 1 个验收卡复合样板，其提案明确写「22 个对话操作台界面片段如何拆成 React 复合组件，另起后续 change 决策并实现」——**该后续 change 从未立项**。随后 T4 按「数据正确级」验收从零手撸 `operator-console.tsx`，无任何验收语句锚设计事实源；T6 只归位了令牌层扁平锚。结果：当前桌面台是「数据调试视图」形态——agent 消息整段原文直出、作者标签英文 `user/agent/system`、每条消息挂 runDir 路径、codex 原始 tail 直灌 mono 块、错误红字机器串直出（`exit:42` / `idle-timeout:10ms` / 英文 dead-letter 消息）、侧栏项目名是裸文件夹路径、composer 要求用户手打 `@dev`。

**目标**：按 conversation-console 设计（近单色修订版）把操作台复合组件真正落地，桌面台从调试器形态升为设计稿形态。这同时消掉「机器术语外泄给普通用户」问题（它只是本欠账的症状）。

范围（复合组件清单）：
- **agent 折叠消息**：agent 消息默认折叠为「角色中文名 + 阶段 + 结论 + 交棒行」，点开全文才展开原始内容。
- **运行块**：角色 + 耗时 + 中断按钮；有计划步骤数据时逐条推进（已完成 / 进行中 / 未开始），拿不到步骤数据时降级为单行人话概括；原始输出点开才可见。
- **侧栏**：项目显示目录名而非裸路径；会话按「等你 > 运行中 > 静止 > 已完成」排序，已完成折叠。
- **角色与状态人话化**：`user/agent/system` 作者标签、`worktree/direct`、cwd / runDir、dead-letter / handoff 系统消息全部转中文人话；原始机器信息折叠可查、不删。
- **composer @ 补全面板**：协议由控件生成，不教用户手打 mention。
- 空状态、顶栏会话上下文。
视觉参照：旧 HTML 原型可用 `git archive d50f119^ component-library` 取回作实现期参照（22 个组件的成品形态），不回迁入仓库。

依赖：T6 已完成；与 T7 改动不同文件，可并行。

验收场景（细化时保留，**每条锚设计事实源**）：(a) 打开桌面台会话页，对照 `openspec/changes/conversation-console/wireframes.md` 时间线节 → agent 消息默认折叠为「角色 + 阶段 + 结论 + 交棒行」，点开可见全文；(b) 触发一轮运行 → 运行块显示角色中文名 + 耗时 + 中断按钮，无步骤数据时为单行人话概括，原始输出点开才可见；(c) 构造 failed / stuck / interrupted / dead-letter 各一 → 时间线内错误均为中文人话概括、原始机器信息折叠可查；对主界面用户可见文案跑机器词检查（`worktree|direct|cwd|runDir|dead-letter|handoff` 及英文作者标签）→ 应命中 0（代码标识符与折叠详情除外）；(d) 侧栏 → 项目名为目录名；会话按上述优先级排序、已完成折叠；(e) 在 composer 输入 `@` → 出现角色补全面板，可选中发送，无需手打完整 mention；(f) `pnpm --filter @agent-moebius/console-ui test`、`pnpm --filter @agent-moebius/desktop build`、`pnpm typecheck` 全绿，storybook 含上述复合组件 story。

验收证据（2026-07-11）：T6.5 已按 `openspec/changes/desktop-console-t65-integration-closeout/` 实现真实主界面集成；`packages/console-ui/src/console/operator-console.tsx` 已接入 agent 折叠消息、运行块、运行结局、侧栏、角色 composer、空状态和会话上下文顶栏，`packages/console-ui/src/index.ts` 已导出对应复合组件。固定数据浏览器走查 run id 为 `t65-2026-07-11T11-00-14-664Z-658165`，截图见 `artifacts/acceptance/t65-agent-message.png`、`artifacts/acceptance/t65-run-block.png`、`artifacts/acceptance/t65-run-outcomes.png`、`artifacts/acceptance/t65-sidebar.png`、`artifacts/acceptance/t65-role-composer.png`，Storybook 截图见 `artifacts/acceptance/t65-storybook-operator-console.png`，结构化证据见 `artifacts/acceptance/t65-evidence.json` 与 `artifacts/acceptance/t65-evidence.sha256`。证据 JSON 记录 `baseHead=d52f8a3675578cfa45b799bc572ee19b637b4dad`、`testedSourceDigest=b7ce9c5d7d15ac1bb513fb7dc3ece896d9282599b1f8b369adc1324dee0c9117`，并记录可见文案与完整 ARIA snapshot 对 `worktree|direct|cwd|runDir|dead-letter|handoff` 命中 0、英文作者标签命中 0；可见文案快照见 `artifacts/acceptance/t65-visible-copy.txt`，ARIA 快照见 `artifacts/acceptance/t65-accessibility-snapshot.yml`。回归命令：`pnpm --filter @agent-moebius/console-ui test`、`pnpm --filter @agent-moebius/console-ui typecheck`、`pnpm --filter @agent-moebius/desktop build`、`pnpm typecheck`、`pnpm exec tsx scripts/acceptance/local-console-t65.ts` 均退出码 0。

### - [x] T7 · GitHub 降为互斥 flag 模式 + 收尾（`成品级`）

默认 local；启动参数切纯 GitHub 模式，二选一、运行时不并存、数据不互通。GitHub-mode flag 固定为 `--github-mode`，用法为 `pnpm start -- --github-mode`；local 与 GitHub runner 分别使用 `.state/local-console.sqlite` 和 `.state/github-runner.sqlite`。观察页 / GitHub 呈现类规格已归入 `local-console`，`docs/wireframes/pages/console.md` 与 `docs/wireframes/flow.md` 已成为现行版式事实源；`AGENTS.md` 已显眼记录启动形态、数据隔离与常驻 runner 命令迁移要求。

验收场景（细化时保留）：默认启动 → 走本地不碰 GitHub，**全程 fake `gh` 零调用**；**不配置任何 repository、不做 `gh auth` 的干净环境冷启动 → 应正常起且无报错**（当前 `pnpm start` 无条件起 GitHub heartbeat，本条防回归）；带 flag 启动 → 走 GitHub 不碰本地库；两模式数据互不可见。

验收证据（2026-07-11）：#129 / PR #139（merge commit `b7876ed`）已实现 exact `--github-mode` 解析、默认 local、纯 GitHub heartbeat、独立 `.state/local-console.sqlite` / `.state/github-runner.sqlite`、GitHub state 有界迁移与 desktop runner child 显式 GitHub mode；#130 / PR #140（merge commit `395e4a9`）已把 observer / GitHub 呈现类规格迁入 `local-console`，将版式事实合入 `docs/wireframes/pages/console.md` 与 `docs/wireframes/flow.md`，并删除旧 `observer.md`。#131 在最新 main 上复跑 `pnpm exec vitest run tests/runtime-start.test.ts tests/github-state-store.test.ts` 退出码 0（2 文件、11 测试），覆盖默认 local 不准备/创建 GitHub runtime、无 repository 且无 GitHub auth 的真实 `pnpm start` 冷启动无报错、带 `--github-mode` 不启动 local console / 不创建 local SQLite、代表性 local message 与 GitHub intake 分库互不可见且不镜像；`pnpm --filter @agent-moebius/desktop exec vitest run tests/runner-launch.test.ts` 退出码 0（1 测试），证明 desktop runner child 显式携带 GitHub mode。全量 `pnpm test` 退出码 0（root 37 文件 / 442 测试、desktop 6 文件 / 16 测试、console-ui 3 文件 / 10 测试），`pnpm typecheck`、归档前 `pnpm exec openspec validate m4-t7-operational-docs-roadmap-pr-closure --strict`、`git diff --check` 均退出码 0。`AGENTS.md` diff 新增“启动形态（运维必读）”，显眼列出 flag `--github-mode`、固定用法 `pnpm start -- --github-mode`、缺省 local、带 flag 纯 GitHub、两模式数据隔离，以及常驻 runner 必须更新启动命令的运维要求。

### - [ ] T8 · 里程碑终点真人验收（真实 codex 全链路，硬性 gate，`成品级`）

**问题**：T3–T6 的验收证据全部由 stub codex 脚本产生（`scripts/acceptance/local-console-t45/t46/t5.ts` 的 `runCodex` 均为 fixture 注入的假实现），整个 M4 唯一一次真实 codex 运行是 T2 的单条 hello。本文档「成功标准」所写的**真人从桌面台发起真实多角色目标、真实 codex 走完方案链与本地验收**从未被演练。脚本验收覆盖异常路径、符合各任务「数据正确级」档位，但按 `milestone-standards.md`，`成品级` 终点必须面向真实使用验收——**本任务是 M4 关闭的硬性 gate，未过则 T5 的完成态只视为「脚本级对等」**。

范围：真人从桌面壳发起一个真实多角色协作目标（打开真实 git 目录），真实 codex 跑完 ceo → dev-manager → dev → qa 方案链与本地验收走查，全程状态在桌面台完备可见；不修代码，只演练、留证、回流缺陷。演练中发现的缺陷按严重度决定是否 gate（阻断多角色链路 / 状态失真的必须修复后重跑；纯体验项回流 T6.5 或后续任务）。

验收场景（细化时保留）：(a) 不配置任何 repository、不做 `gh auth`，启动桌面壳 → 打开一个真实 git 目录 → 发一条目标形状消息 → 应看到四角色真实接力完成方案链、验收走查回流，全程零 GitHub 调用；(b) 全程关键节点截图 + 结束后 SQLite 快照落 `artifacts/acceptance/`（真实 codex 版本号入证据文件）；(c) 期间进行中 / 等待真人 / 卡住 / 错误状态在桌面台完备可见，任一状态失真记为不通过；(d) 若启用 worktree 模式 → 原目录 `git status` 全程无脏改。

## 非目标

- 不动核心链路（conversation / trigger / codex / guardrail / goal-ledger）的业务语义，只换输入输出介质与持久化载体。
- 不做本地与 GitHub 双通道并存、不做两模式数据互通 / 镜像。
- 不承接 M3 遗留卡点 A–K（runner 稳定性 / 额度 / 编排维度），那是正交 track。

## 启动条件

本文档任务经细化（补齐验收语句、范围、依赖）并获用户裁决；T1（CEO 方案链默认）可独立先落于当前 GitHub 运行时；T2 作为本地化风险优先 spike，其结论回流细化 T3–T6。
