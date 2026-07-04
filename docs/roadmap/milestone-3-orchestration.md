# 里程碑 3：目标账本 + 编排者（草案）

> **状态：草案。** 各任务的验收语句在里程碑 2 收尾时依据 run manifest 实际形态与 `docs/roadmap/milestone-standards.md` 细化，经用户裁决后启动。本文档先固化方向、结构与边界，防止里程碑 2 期间的设计决策与本方向冲突。

## 背景

架构缺的第二个器官是**分身**：大目标（QA 走查一批问题、epic 级功能面）无法拆解、并行、集成验收。前置条件到里程碑 2 收尾时已齐备：运行级验收闭环（每个子任务有 oracle）、runner 稳定性（并行把失败率按 issue 数放大，已加固）、里程碑设定标准（编排者的决策尺子）、run manifest（账本的数据雏形）。

本里程碑同时收编 goal-driven-decomposition 的三个已知毛病，病根相同——**目标与阶段不是一等公民状态，只隐含在文件系统里**：(a) 一次只接收部分目标 → 缺目标采访入账步骤；(b) 多次执行跨阶段串扰 → 阶段无显式作用域，残留文件冒充当前上下文；(c) 阶段质量基准混淆（demo 期 vs 成品期）→ 基准未被记录。三者统一由**目标账本**解决。

## 核心设计立场（先行固化）

- **GitHub 仍是对话与执行介质**：一个子任务 = 一个 issue，时间线、mention、验收回流机制全部沿用。账本是编排状态层，不是对话基座替代品。
- **CEO 一个身份、两条调用路径**：需要分离的是调用路径与失败语义，不是身份。发布时 guardrail hook 保持现状——无状态、每评论必经、fail-open（失败放行原文）；在此之上把 CEO 升级为可 mention 的普通 agent（`@ceo` 进 `availableAgentNames`，独立 role thread），承载编排职责，编排动作 **fail-closed**（失败停下留痕，不带病编排）。如同真人 CEO 既审外发公告也主持规划会。防自激环：guardrail 对 CEO agent 自身评论的 append 必须有界。
- **拆解的产物是验收语句清单**，任务只是验收语句的实现；分组依据是冲突面最小（按页面 / 模块分组，不按问题类型分组）。
- **质量基准是里程碑 / 阶段的显式属性**，写入账本，由编排者注入每个子任务 issue，不靠执行方悟。
- **worktree 是 issue 级资源，不是 dev 专属**：同 issue 严格串行保证共享 worktree 天然无竞态；角色按 frontmatter 声明访问模式（dev 写、验收 / qa 读 + 运行），解锁"验收角色亲自执行验收语句"。
- **一个 issue = 一场对话**是不变式：多方讨论不在一条时间线里交错，而是落在独立（子）issue，结论回流父 issue。会话拓扑有两种：**接力棒**（现状，一次一棒串行移交）与**圆桌**（主持人 + 同轮扇出 + join）。

## 成功标准（里程碑级）

一个真实的多子任务目标（如 qa-web 走查产出的一批问题）完整走过：**目标采访入账 → 编排者按标准拆解为带验收语句的子任务并分组 → spawn 子 issue 并行执行 → 每个子任务经验收角色走查 → 集成验收点确认合并后整体成立 → 账本与观察页反映全程状态**；用户只在闸口出现。

## 任务清单（粗粒度，验收语句待细化）

### - [x] T1 · 目标账本 schema 与落地

目标 / 里程碑 / 任务 / 阶段 / 质量基准 / 父子 issue 关系的一等公民本地状态；含目标采访入账流程（解决"部分接收"）；与 run manifest 的关系在方案阶段定（扩展或引用）。

验收证据（2026-07-04）：
- 方案与归档：`openspec/changes/archive/2026-07-04-goal-ledger-t1/`
- 行为事实源：`openspec/specs/goal-ledger/spec.md`
- 实现：`src/goal-ledger.ts`、`src/goal-ledger-state.ts`
- 测试：`tests/goal-ledger.test.ts`、`tests/goal-ledger-state.test.ts`
- 验证命令：`pnpm test -- goal-ledger`、`pnpm test`、`pnpm typecheck` 均退出码 0。

### - [x] T2 · 阶段作用域隔离

阶段有显式边界：阶段切换时上一阶段产物归档，工作区上下文只呈现当前阶段的目标与质量基准（解决"跨阶段串扰"与"基准混淆"）。

验收证据（2026-07-04）：
- 方案与归档：`openspec/changes/archive/2026-07-04-goal-ledger-phase-scope-isolation-t2/`
- 行为事实源：`openspec/specs/goal-ledger/spec.md`
- 实现：`src/goal-ledger.ts`
- 测试：`tests/goal-ledger.test.ts`
- 验证命令：`pnpm test -- goal-ledger --reporter=verbose`、`rg -n "node:fs|from 'fs'|child_process|src/github|src/codex|shell" src/goal-ledger.ts`（无匹配）、`pnpm test`、`pnpm typecheck`。

### - [x] T3 · CEO 升级为普通 agent（编排路径）

`@ceo` 进入 `availableAgentNames`，获得独立 role thread 与账本访问 prescript；编排职责：读账本、按 `milestone-standards.md` 拆解、冲突感知分组、spawn 子 issue、注入质量基准与验收语句；编排动作 fail-closed。**CEO 的工作模型是剧本库分发，不是即兴思考**：每次调用只做"识别场景 → 识别工作流 → 套对应模板 + `@` 对应角色"三步（里程碑 2 T9 的方案评审 / 执行后复盘模板是首批剧本）；剧本是数据（模板文件），新增工作流 = 新增剧本，不改 CEO 判断逻辑；只有剧本覆盖不到的场景才动用自由判断托举项目继续前进（T8 兜底路由即托举入口）。guardrail hook 路径保持无状态 fail-open 不变，两条路径共用 persona 素材但判据分节。防自激环：guardrail 对 CEO agent 评论的 append 必须有界；CEO agent 响应仍照常过 guardrail 格式红线。与里程碑 2 T8 汇合：无 mention 外部评论的兜底路由可实现为自动移交 `@ceo`，真人 / watcher 也可手动 `@ceo` 索取路由裁决。

验收证据（2026-07-04）：
- 方案与归档：`openspec/changes/archive/2026-07-04-ceo-agent-orchestration-t3/`
- 行为事实源：`openspec/specs/github-issue-runner/spec.md`、`openspec/specs/goal-ledger/spec.md`
- 架构事实源：`docs/architecture/ceo-agent-orchestration.svg`、`docs/architecture/module-map.md`
- 剧本与 persona：`agents/ceo.md`、`agents/ceo-scripts/plan-review.md`、`agents/ceo-scripts/post-implementation-retro.md`、`agents/ceo-scripts/milestone-spawn-child-issues.md`
- 实现：`src/ceo-scripts.ts`、`src/ceo-orchestration.ts`、`src/agent-prescripts/ceo-ledger-context.ts`、`src/runner.ts`、`src/github.ts`、`src/format-ceo.ts`、`src/triggers/mention-trigger.ts`、`src/goal-ledger.ts`
- 测试：`tests/ceo-scripts.test.ts`、`tests/ceo-orchestration.test.ts`、`tests/runner.test.ts`、`tests/format-ceo.test.ts`、`tests/github.test.ts`、`tests/triggers.test.ts`
- 验证命令：`pnpm test -- tests/runner.test.ts`、`pnpm test`、`pnpm typecheck` 均退出码 0。
- 验收清单：需求持有者已确认最新落盘方案中的 23 条验收语句；实现证据覆盖 CEO 可触发、独立 role thread、ledger prescript fail-closed、剧本加载、三类剧本、真实子 issue adapter、质量基准 / 验收语句注入、guardrail fail-open、防自激、T8 汇合、非目标边界，以及 QA 增补的超时、部分成功重试、ledger 保存失败、JSON + stage marker、shell metacharacters、title drift 与 hidden key 找回故障注入场景。

### - [x] T4 · 验收路由与集成验收点

子任务级验收沿用里程碑 1 机制；新增 join 语义：全部子任务通过后触发集成验收（合并后的整体按目标级验收语句走查），失败回流为新子任务。

验收证据（2026-07-04）：
- 方案与归档：`openspec/changes/archive/2026-07-04-integration-acceptance-join-t4/`
- 行为事实源：`openspec/specs/goal-ledger/spec.md`、`openspec/specs/github-issue-runner/spec.md`
- 实现：`src/goal-ledger.ts`、`src/runner.ts`、`src/ceo-scripts.ts`、`agents/ceo-scripts/integration-acceptance.md`、`agents/ceo-scripts/integration-repair-child-issues.md`
- 测试：`tests/goal-ledger.test.ts`、`tests/runner.test.ts`、`tests/ceo-scripts.test.ts`
- 验证命令：`pnpm typecheck`、`pnpm test`、`git diff --check` 均退出码 0。
- 验收清单：需求持有者已确认正式验收语句 1-18 全部通过；实现证据覆盖 child pass 判定、ledger provenance、父 issue integration acceptance 路由、active phase acceptance 来源、父级失败 repair child 回流、修复后重新 join、幂等去重、缺目标验收 fail closed、scope 与真实角色边界，以及 QA 增补的 ledger save 失败、父 issue 发帖失败、重复 fact、带 handoff mention 的失败入账、缺 parent ref、repair 部分成功恢复、hidden key lookup timeout 和非目标边界。

### - [x] T5 · issue 级 worktree 资源化

worktree 供给从 `agents/dev.md` 专属 preScript 升级为 issue 级 capability：任意角色可在 frontmatter 声明访问模式（写 / 读 + 运行），分支命名去 role 化，context 状态随迁。**重建策略修订并入本任务**：修复"复用 worktree 时 main 已前进则强制重建"对并行任务与验收中场景的破坏（进行中工作不得因其他任务合入 main 而被摧毁），这是任务级并行（T3 编排产出并行子 issue）的硬前提。解锁场景：qa 在 worktree 内跑测试、验收角色在 worktree 内起服务亲自执行验收语句。

**前置探针（【人工】spike，建议作为本任务第一步，风险优先）**：直接动因 tranfu-agents-app issue 96（评论 id 4882229942）——用户问 qa「/skills 页面有哪些问题」，预期发现真实问题，qa 因无 workspace、无运行能力、无走查剧本，只能输出 9 条假设清单。spike 回答本任务最大不确定点："非 dev 角色能否在 worktree 内起目标 app、实地走查并产出真实发现"。链路：`agents/qa.md` 声明 `workspaceAccess: read-run`，由 issue-worktree capability 切入同 issue 共享 worktree → worktree 内起 tranfu-agents-app dev server → 按目标画像走查页面（可复用 `scripts/spike-preview-oracle/` 的 Playwright 手法）→ 产出锚定具体页面元素 / 路由的发现清单 + 截图 → 经 publisher 发布回 issue。

**验收场景（细化时保留）**：重演 issue 96——在 tranfu-agents-app 的 QA 走查 issue 上 mention qa → qa 评论应含 ≥3 条真实发现，每条锚定具体页面元素或路由、附截图链接、且可由人按"打开 X → 做 Y → 应看到 Z"复现，而非假设清单。链路断点（prescript 不适配非 dev 角色 / 目标 app 起不来 / 截图发布失败）记录为本任务方案输入。

验收证据（2026-07-04）：
- 方案与归档：`openspec/changes/archive/2026-07-04-issue-worktree-capability-t5/`
- 行为事实源：`openspec/specs/github-issue-runner/spec.md`
- 架构事实源：`docs/architecture/module-map.md`、`docs/architecture/runner-issue-processing.svg`
- Persona：`agents/dev.md` 声明 `workspaceAccess: write`；`agents/qa.md`、`agents/product-manager.md`、`agents/hermes-user.md` 声明 `workspaceAccess: read-run`；`dev-manager`、`ceo`、`secretary` 未声明 issue workspace access。
- 实现：`src/agent-manifest.ts`、`src/agent-context-state.ts`、`src/agent-prescripts/issue-worktree.ts`、`src/runner.ts`、`src/config.ts`
- 测试：`tests/agent-manifest.test.ts`、`tests/agent-context-state.test.ts`、`tests/issue-worktree.test.ts`、`tests/runner.test.ts`
- 验证命令：`pnpm test`（29 个 test files / 307 tests，退出码 0）、`pnpm typecheck`（退出码 0）、`git diff --check`（退出码 0）。
- 聚焦验证：`pnpm vitest run tests/agent-context-state.test.ts tests/agent-manifest.test.ts tests/issue-worktree.test.ts tests/runner.test.ts --reporter=verbose`（4 个 test files / 81 tests，退出码 0）。
- 外部 issue 96 前置探测：`gh issue view 96 --repo tranfu-labs/tranfu-agents-app --json number,title,state,url` 返回 `96 / QA: skills / OPEN / https://github.com/tranfu-labs/tranfu-agents-app/issues/96`；`git ls-remote https://github.com/tranfu-labs/tranfu-agents-app.git HEAD` 返回 `8d6731ecfd9079a2c9dd6c7fa738f2dc5bceeb93`；临时 clone 成功；`frontend/npm ci`、`frontend/npm run build` 均退出码 0；临时 Vite dev server 下 `curl http://127.0.0.1:4196/skills` 返回 HTTP 200。
- 外部 issue 96 live-walkthrough 卡点：本实现阶段未在 tranfu-agents-app issue 96 上触发 qa 并发布含截图的真实评论，因为这会对外部产品 issue 产生真实 GitHub 副作用；因此未声称 QA live-walkthrough 已通过。后续产品验收需在 runner 监听 tranfu-agents-app 的真实环境中触发 qa，并按已确认验收语句核查至少 3 条锚定页面元素或路由的真实发现与截图链接。

### - [ ] T6 · 会话拓扑：扇出 + join 与主持人圆桌

新增第二种会话拓扑。原语层：一条消息可触发 N 个 agent（扇出），全部响应后唤醒收口角色（join）——role thread 本就按 issue+role 独立，非 dev 角色无文件状态，机制可行。模式层：主持人角色主持圆桌——出题 → N 角色同轮并行发言 → 主持人汇总 → 下一轮或收口；圆桌落在独立（子）issue，结论回流父 issue，复用 T1/T3 的父子机制。实施分层：**v0 串行圆桌**（主持人一轮 @ 一人，现有机制即可跑，先验证模式价值）→ **v1 并行化**（扇出 + join 原语）。典型场景：方案评审团（qa + dev-manager + 用户画像并行评审，替代串行接力）、需求工作坊（PM 同时采访多个用户画像）、集成验收陪审团。

### - [ ] T7 · 观察页升级为账本 UI

从只读 run 视图升级为目标 → 里程碑 → 任务树视图；是否引入操作能力（人工闸口在页面上确认）在方案阶段论证。

### - [ ] T8 · 目标入账剧本（goal-intake）

补齐账本写路径的用户侧入口，设计原则：**用户只表达目标，不需要知道"拆解"这个概念**。"我想要做一个 X"是目标形状的话——识别它是 CEO 的场景识别职责，不是用户的请求义务；无 mention 时由里程碑 2 T8 兜底路由移交 `@ceo`。剧本四步（goal-driven-decomposition 哲学的组织层移植：先验推断、按需拆解）：

1. **先推断后提问**：按世界知识推断目标最可能形态并给出假设清单；只采访真正改变拆解走向的 2–4 个分叉点（核心用户、第一个想亲眼看到的场景、质量基准、明确不做什么），一次问完，不开放式盘问；用户纠正增量而非从零作答。
2. **入账**（新 CEO action `goal_intake`，副作用经 runner、fail-closed）：目标 + 粗粒度里程碑（每个一行 objective）+ **仅阶段 1 拆细**（质量基准、子任务、验收语句）。**渐进拆解，只拆当前阶段**——后续阶段停留在粗条目，拆解粒度跟着确定性走，不产全量前期计划。
3. **提案待确认**：发布拆解提案评论（假设清单 + 阶段 1 子任务 + 各自验收语句），用户确认或纠偏后才 spawn；提案式而非许可式，CEO 默认往前推，用户只在提案点出现。
4. **阶段到期回访**：阶段 1 集成验收通过后 CEO 回访——`switch_phase`（强制归档旧阶段）+ 采访阶段 2 口径，此时才细化阶段 2。这是 T2 阶段隔离语义的第一个真实消费场景。

验收场景（细化时保留）：在 issue 里只写「我想要做一个支付宝」（不带任何 `@`）→ 应看到 CEO 被兜底路由唤醒、给出假设清单与 ≤4 个分叉问题 → 用户一句话回答后 → 应看到账本含目标 + 粗里程碑 + 细化的阶段 1，以及待确认的拆解提案评论；确认后 spawn 的子 issue 均带阶段 1 的质量基准与验收语句。

### - [ ] T9 ·【人工】多任务目标端到端 dogfood

真实多子任务目标完整走成功标准闭环（含至少一次圆桌评审与一次 goal-intake 入账），记录卡点。

### - [ ] T10 ·【人工】产品域端到端：三案 → 选案 → 实现 → 视觉对照验收（tranfu-agents-app）

第一个纯产品域垂直切片：在 tranfu-agents-app 新建一个页面 / 新功能，验证"设计提案 → 决策 → 自动实现 → 视觉对照验收"的完整价值链。它同时是 Figma 对齐流程的先导实验——先证明"按图实现 + 按图验收"成立。流程五步：

1. **需求入场**：issue 描述新功能（可经 T8 goal-intake，或直接一句话需求）。
2. **三案生成**：dev 在 Codex 运行中生成 3 张视觉方案图（标注 A / B / C），经现有 artifact publisher 发布到 issue 评论。**fallback**：生图失败时由 loop watcher 代为生成（如 HTML mockup + Playwright 截图链路），fallback 的启用与原因必须在 issue 时间线声明，不得无痕替换。
3. **选案（全自动）**：product-manager 对照用户画像与页面目标自动选定一案并给出理由，mention dev 继续。
4. **自动实现**：dev 按选定方案实现页面（无 code gate），完成后在 worktree 起 app、按验收语句截取最终结果，经 publisher 发布，打 `code-verified`。
5. **视觉对照验收**：验收角色同时获得选定方案图与结果截图（issue 媒体管线会把两图注入其 Codex 输入），输出两部分结论——逐条验收语句走查 + **与选定方案的一致性对照**（布局 / 信息结构 / 主要元素逐项对照，不苛求像素级）。

**角色分配**：验收主由 `tranfu-agents-manager`（该 app 的用户画像）担任，product-manager 选案时参照其画像文件与页面目标。

**观察对象与托举预案**：`tranfu-agents-manager` 在既往 tranfu-agents-app issue 中表现存疑，本任务将其作为观察对象——不预先改画像，由 loop watcher 在执行中"托举"，且托举设计必须保住观察价值：
1. **喂料托举（事前，主要手段）**：确保它每次发言面前有具体对象（方案图、页面目标、其子目标与本页面的映射）——画像红线本就要求"只对摆在面前的具体东西发言"，历史表现不佳的首要假设是输入太抽象（与 issue 96 qa 同病因），本任务顺带验证该假设。
2. **纠偏托举（事后，有门槛）**：仅当其响应违反自身画像红线（脱离所见复述偏好清单、结论无法回答"你说的是哪里"）或流程卡死时，watcher 以平文身份按交互协议介入，请其锚定具体点重答；**禁止代替其选案或验收结论**。
3. **托举留痕**：每次介入用 `[loop watcher — 托举]` 前缀 + 原因，事后可区分画像的本来表现与被托举后表现；观察到的画像缺陷清单追记到本任务证据区，回流为画像改进任务。

**验收场景（细化时保留）**：
1. 打开该 issue → 应看到一条含 3 张方案图（A / B / C）的评论。
2. 应看到 product-manager 评论明确选定一案并给出理由。
3. 应看到 `code-verified` 评论含最终页面截图链接。
4. 应看到验收角色的对照结论：逐条验收语句 + 与选定方案的一致性判断。
5. 全程用户零介入（观战除外）；出现卡点时按演练惯例记录回流，不现场改规则。

**依赖**：T5（非 dev 角色 / 目标 app worktree 链路先被 spike 验证）、T4（验收路由）；建议与 T9 相邻执行或作为 T9 的素材场景之一。

## 非目标

- 不脱离 GitHub 对话介质；不重建时间线 / mention / 验收机制。
- Figma 对齐流程仍不做（依赖视觉对比 oracle，独立立项）。
- PR 预览基建仍按 `docs/roadmap/spike-preview-oracle.md` 的触发条件判断，不预设。

## 待细化候选观察

以下条目是里程碑 2 运行期间 dogfood 观察到、尚未定型的 runner 稳定性 / 编排缺口，本文档启动时并入某个 T 或另起新 T：

- **账本写路径整体未接线**（2026-07-04，T1–T3 完成后核查）：`saveGoalLedgerState` 与 `switchActivePhase` 在运行时代码中无任何调用方，账本目前只读生效（CEO prescript 读 projection → spawn 注入子 issue）。三个缺失入口：(a) **目标采访入账**——T1 intake 是纯 helper，无 CEO action / CLI，用户无法通过对话把目标写进账本，只能手工编 `.state/goal-ledger.json`；(b) **阶段切换**——"切换即归档"的 fail-closed 语义已实现但无人能触发，阶段隔离最关键的动作只能手工改 JSON；(c) **spawn 回写**——CEO spawn 子 issue 后账本不记录 child issue refs，账本与现实立即漂移。三者是 T4 / T8 dogfood 的前置接线；入账与切阶段建议做成 CEO 新 action（`goal_intake` / `switch_phase`），沿用"副作用只经 runner 受控执行 + fail-closed"的既有立场。
- **无匹配剧本时的固定结论行误用**（2026-07-04，tranfu-agents-app issue 96）：qa 被问页面走查问题（无匹配剧本的场景），误套方案审查剧本——开头声明「当前没有 plan-written 方案评论」、结尾仍输出固定结论行「QA 结论：通过」。缺规则：**无匹配剧本时不得套用任何固定结论行**，应说明能力边界并建议下一步（如指出需要 workspace 走查能力、建议等 T5）。落点：`agents/qa.md` 及 T3 剧本分发规则的负向约束；性质与 CEO 托举同源——识别不了场景时诚实说不知道，而不是套最近的模板。
- **Codex CLI 额度失败识别与退避**（2026-07-04 首次命中）：codex CLI 返回 `You've hit your usage limit` 时 runner 只见 `exit-code-1`，与 gh EOF 等瞬断同等对待；约 5 分钟内失败预算耗尽 → dead-letter → 即便额度恢复也不再自动 pick up。缺口：(a) 从 codex stdout.jsonl 抽取错误类别（usage limit / rate limit / network），按类采用不同退避（usage-limit 应按 "try again at <time>" 直接退到目标时刻，不占失败预算）；(b) event 层暴露分类字段，loop watcher 不用 tail runDir 才知道根因；(c) dead-letter 之后额度恢复时可自动 recover 已 idle 的 issue。可能落在 T3（CEO 编排剧本库对失败的分场景处理）或与 T5 worktree 供给同批做 runner 侧改造。

## 启动条件

里程碑 2 T1–T7 全部收尾，且本文档任务经细化（补齐验收语句、范围、依赖）并获用户裁决。
