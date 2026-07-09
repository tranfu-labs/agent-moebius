# 里程碑 4：默认本地对话操作台（草案）

> **状态：草案。** 各任务验收语句依 `docs/roadmap/milestone-standards.md` 细化，经用户裁决后启动。本文档先固化方向、结构与边界。
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

### - [ ] T1 · CEO 默认走方案链、拆分只在明确表达时触发（`数据正确级`）

独立可先落的垂直切片（跑在当前 GitHub 运行时，与后续本地化正交）。**问题**：goal-intake 拆分不稳定；且「默认拆分」是机制层硬约束——`src/agent-prescripts/ceo-ledger-context.ts` 在 intake bootstrap（无 active phase）时注入「只能用 goal-intake 工作流」，TS 校验拒绝非 goal-intake 输出，**只改 `agents/ceo.md` 改不动这条闸**。**目标**：一个目标形状的新会话默认走 `ceo + qa + dev-manager + dev` 方案链（dev 出方案 → qa 审 → 验收），goal-intake 拆分只在用户**明确表达拆分 / 编排意图**时触发。

范围（碰机制，非纯 md）：放宽 `ceo-ledger-context.ts` 的 bootstrap 判据（无明确拆分意图时允许路由到方案链）+ 收紧 `agents/ceo.md` 兜底路由 / 目标入账判据 + `goal-ledger` / `github-issue-runner` spec-delta + 测试。

验收场景（细化时保留）：在 issue 里只写目标形状「我想做一个 X」（无明确拆分意图）→ 应看到 CEO 路由到方案链、不进 goal-intake 拆子 issue；在 issue 里明确写「把这个拆成多个任务并行做」→ 才应看到 goal-intake 采访 / 提案 / 拆分。

### - [ ] T2 · 本地端到端最小闭环（风险优先 spike，`demo 级`）

消除本里程碑最大不确定性：**纯本地通道能否替代 GitHub 做输入源 + 输出汇，同时核心链路照常工作**。一条最小垂直叙事——真人在最小本地界面发一条带 mention 的消息 → runner 经 local intake adapter 拾取 → codex 跑 → 回复经 local sink 落回本地并显示。允许其他能力假实现（无会话树、无持久化、单会话、UI 极简），但 adapter 边界 + 本地通道 + 最小 SQLite 消息表这条端到端路径不得断。

验收场景（细化时保留）：不配 repository、不 `gh auth` 启动 → 在最小本地界面发「@dev 帮我写个 hello」→ 应看到 codex 真实运行并把回复显示在本地界面，全程无任何 GitHub 调用（fake `gh` 零调用）。

### - [ ] T3 · SQLite 统一持久化 + 会话作基本单元（`数据正确级`）

把 T1 的假持久化换成真实：会话时间线 + 会话树 + `role-threads` / `goal-ledger` / `intake` / `agent-contexts` 全部落 SQLite，废弃 `.state` JSON；GitHub 模式的既有持久化行为**零漂移**（behavior-preserving，回归靠现有 GitHub 全测试仍绿）。会话取代 issue 作 key。

验收场景（细化时保留）：本地跑一轮对话后重启桌面壳 → 应看到会话历史、role thread、账本状态完全一致；跑现有 GitHub 全测试套件 → 应全绿，无行为差异。

### - [ ] T4 · 桌面台成为完备操作台（`数据正确级`）

`console-ui` 从「只设计」升为订阅本地通道的真客户端：项目 → 会话两层导航、单时间线多角色混排、codex 运行过程直播、可中断、状态（进行中 / 等待真人 / 卡住 / 错误）完备可见。GitHub 专属语义在此落成本地原生形态（即时态 / 本地错误记录）。

验收场景（细化时保留）：桌面台发起一次对话 → 应看到运行直播；运行中点中断 → 应看到本轮 codex 被停下且状态如实反映；构造一个失败 → 应看到本地错误记录而非静默。

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
