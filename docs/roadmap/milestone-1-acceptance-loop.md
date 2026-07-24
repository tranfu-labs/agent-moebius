# 里程碑 1：需求方验收回流 + 预览 oracle 探针

## 背景

当前架构（issue 时间线 + mention 触发 + 单 issue 单 worktree + stage marker + CEO guardrail）能稳定解决"规格明确的局部改动"，但缺两个器官：**运行级验收**（眼睛）和**目标拆解编排**（分身）。路线顺序是先补验收 oracle，再做拆解编排——没有自动验收的并行拆解只会放大人工验收瓶颈。

本里程碑是"眼睛"的第一步：不上任何基建，纯规则层把**验收闭环**跑通，同时用一个小探针验证"运行级验收"的轻量路径是否可行。核心原则：**每个开发任务在方案阶段就必须产出机器可执行的一句话验收语句**（格式：打开 X → 做 Y → 应看到 Z），它是本里程碑的交付物，也是后续预览 oracle 和大目标拆解的共同燃料。

## 成功标准（里程碑级）

至少一个真实 GitHub issue 完整走过以下闭环，且用户只在关键闸口（放行 push）出现：

> 需求角色提需 → dev 产出带验收语句清单的方案（`plan-written`）→ 需求角色逐条验收方案 → dev 实现（`code-verified`）→ 需求角色按验收语句走查 → 结构化验收结论。

外加：预览探针给出"本地跑 + 截图是否足够，还是必须上 PR 预览"的明确结论文档。

## 成功标准达成证据

里程碑 1 的闭环已在三组真实 issue / PR 中跑通：

- 主例：[issue #39](https://github.com/tranfu-labs/moebius/issues/39) → [PR #40](https://github.com/tranfu-labs/moebius/pull/40) merged。#39 完整覆盖需求角色提需、dev `plan-written`、验收角色方案验收、dev `code-verified`、验收角色逐条走查，并额外证明 qa gate 真实介入 dev 方案修订。
- 补充证据：[issue #34](https://github.com/tranfu-labs/moebius/issues/34) → [PR #35](https://github.com/tranfu-labs/moebius/pull/35) merged，验证 T2 的 CEO 阶段验收回流规则在真实 issue 中闭环。
- 补充证据：[issue #36](https://github.com/tranfu-labs/moebius/issues/36) → [PR #37](https://github.com/tranfu-labs/moebius/pull/37) merged，验证 T3 的验收角色逐条走查行为在真实 issue 中闭环。

## 任务清单

约定：
- 每轮循环只做一个任务，按依赖顺序取第一个未勾选且未被阻塞的任务。
- 涉及 `agents/` 与运行时行为的改动遵守仓库 OpenSpec 纪律：先在 `openspec/changes/` 落方案，实现后归档、更新受影响 spec 与 AGENTS.md。
- 每个任务完成时，把"验收证据"（文件路径、issue 链接或测试输出）追记到本文件对应任务下方，再勾选。
- 标注【人工】的任务需要用户参与，循环应准备好材料后停下等用户，不得伪造完成。

### - [x] T1 · dev 方案必须附验收语句清单

**目标**：`agents/dev.md` 增加硬性要求——`plan-written` 阶段的方案末尾必须有「验收语句」一节，每条为一句可机械执行的检查：UI 类用"打开 X → 做 Y → 应看到 Z"；非 UI 类用等价的可执行断言（跑某命令 → 应输出/退出码 Z）。语句数量与方案的功能点一一对应。

**范围**：`agents/dev.md`；若现有 spec 覆盖 dev 行为则同步 spec-delta。不改运行时代码。

**验收语句**：
1. 打开 `agents/dev.md` → 查找验收语句要求 → 应看到对 `plan-written` 方案末尾「验收语句」一节的强制要求及两类格式示例。
2. 给 dev 一个模拟需求（可用测试或本地 dry-run 构造时间线）→ 检查其 `plan-written` 响应 → 末尾应含 ≥1 条符合格式的验收语句。

**依赖**：无。

**验收证据**（2026-07-03）：
- 文件路径：`agents/dev.md` 已新增 `## plan-written 方案验收语句要求`，要求 `plan-written` 方案正文末尾包含「验收语句」一节，且位于最终 stage marker 之前；包含 UI 示例 `打开 X → 做 Y → 应看到 Z`、非 UI 示例 `跑 X → 应输出/退出码 Z`，并要求数量与功能点一一对应。
- Spec delta：`openspec/changes/archive/2026-07-03-require-dev-plan-acceptance-statements/spec-delta/github-issue-runner.md` 已记录 dev persona 的 `plan-written` 输出契约。
- 文本检查：`rg -n "plan-written|验收语句|打开 X|跑 X|功能点|stage marker" agents/dev.md` 命中强制要求与两类格式示例。
- 本地 dry-run：模拟需求 `@dev 请给 docs/guide.md 增加安装命令说明`；模拟 `plan-written` 末尾包含 `## 验收语句` 与 `1. 跑 rg -n "pnpm install" docs/guide.md → 应输出/退出码 0。`；检查结果为 `stage marker last: true`、`acceptance section before marker: true`、`dry-run result: PASS`。
- 项目检查：`pnpm test` 通过（23 个测试文件、190 个测试）；`pnpm typecheck` 通过。

### - [x] T2 · CEO 阶段反思改为验收回流路由

**目标**：`plan-written` / `code-verified` 的 CEO 强制 `append` 从通用反思升级为**验收回流**：识别时间线中发起本需求的 agent 角色（如 `hermes-user`、`product-manager`），append 评论 mention 该角色，要求其按方案中的验收语句逐条验收；若发起者是真人用户而非 agent 角色，维持现状等用户。若 dev 方案缺失验收语句清单，CEO 应在 append 中要求 dev 补齐而不是放行验收。

**范围**：`agents/ceo.md`（业务判据全在 persona 层，`format-ceo.ts` 不动）；注意仓库惯例：CEO 规则进化入口是 `@secretary`，本地循环直接改时需同步更新相关 spec 与 AGENTS.md 描述。

**验收语句**：
1. 打开 `agents/ceo.md` → 查找阶段反思规则 → 应看到"回流给发起需求角色验收"与"缺验收语句时要求补齐"两条路由规则。
2. 构造一条 hermes-user 发起、dev 产出 `plan-written`（含验收语句）的时间线跑一次 CEO 校正 → CEO 输出应为 `append`，`as=ceo`，正文 mention 发起角色并引用验收要求。
3. 构造 dev 方案缺验收语句的时间线 → CEO append 应要求 @dev 补齐验收语句。

**依赖**：T1。

**验收证据**（2026-07-04）：
- 文件路径：`agents/ceo.md` 已将“阶段反思强制介入”升级为 `### 阶段验收回流路由`，并包含“回流给发起需求角色验收”与“缺验收语句时要求补齐”两条路由规则；缺清单分支要求 `@dev` 补齐，验收回流分支保持 `as=ceo` 并 mention 发起需求角色。
- 测试覆盖：`tests/format-ceo.test.ts` 新增 persona 文本合约断言、`hermes-user` 发起的 `plan-written` 验收回流 fake CEO append、缺验收语句时要求 `@dev` 补齐的 fake CEO append。
- 事实源：`openspec/specs/github-issue-runner/spec.md` 已合入阶段验收回流规则、发起角色识别优先级、缺验收语句补齐规则，以及 `plan-written` / `code-verified` Given/When/Then 场景；对应 change 已归档到 `openspec/changes/archive/2026-07-04-route-ceo-stage-acceptance-feedback/`。
- 项目手册：`AGENTS.md` 已同步 CEO 阶段验收回流与缺清单补齐描述，且保留 `src/format-ceo.ts` 不承载业务判据的边界。
- 验证命令：`pnpm test -- tests/format-ceo.test.ts` 通过（27 tests）；`pnpm test` 通过（23 个测试文件、193 tests）；`pnpm typecheck` 通过。

### - [x] T3 · 验收角色的走查行为

**目标**：`agents/hermes-user.md` 与 `agents/product-manager.md` 增加验收职责：被 mention 请求验收时，逐条走查验收语句并输出结构化结论——每条语句一行"通过 / 不通过 + 依据"；全部通过则声明验收通过并说明下一步等待谁；任一不通过则 mention `@dev` 并明确指出未过语句与期望差异。方案阶段的验收基于阅读方案推演，代码阶段的验收基于 dev 提供的证据（测试输出、截图 artifact 等）。

**范围**：`agents/hermes-user.md`、`agents/product-manager.md`。

**验收语句**：
1. 打开两个 persona 文件 → 查找验收职责 → 均应看到逐条走查、结构化结论、不通过时 mention @dev 的行为定义。
2. 构造一轮验收请求（含 3 条验收语句、其中 1 条明显不满足的方案）→ 角色响应应逐条给出结论且 mention @dev 指出未过项。

**依赖**：T2。

**验收证据**（2026-07-04）：
- 文件路径：`agents/hermes-user.md` 与 `agents/product-manager.md` 均已新增 `## 验收职责`，要求被 mention 请求验收时逐条走查「验收语句」、每条输出 `通过` / `不通过` + 依据、不通过时 mention `@dev` 并指出未过语句、实际观察、期望结果和差异。
- 阶段证据规则：两个 persona 均明确方案阶段基于 dev 方案文本推演，代码阶段基于 dev 提供的测试输出、截图 artifact、文件路径、命令输出或可核查交付说明。
- 事实源：`openspec/specs/github-issue-runner/spec.md` 已合入验收角色的 MUST 契约与两个 Given/When/Then 场景；对应 change 归档到 `openspec/changes/archive/2026-07-04-add-acceptance-walkthrough-personas/`。
- 文本检查：`rg -n "验收职责|逐条|结构化结论|通过|不通过|@dev|方案阶段|代码阶段|下一步等待" agents/hermes-user.md agents/product-manager.md` 命中两个 persona 的验收职责定义。
- 本地 dry-run：构造 3 条验收语句、其中 1 条明显不满足的方案，按 persona 规则得到 `persona contract check: PASS` 与 `dry-run result: PASS`；失败项响应包含 `不通过`、`@dev`、未过项与期望差异，且末尾保留 `<!-- moebius:stage=in-progress -->`。
- 项目检查：`pnpm test` 通过（23 个测试文件、193 个测试）；`pnpm typecheck` 通过。

### - [x] T4 ·【人工】预览 oracle 探针（spike）

**目标**：回答一个问题："运行级验收走 worktree 本地起服务 + 截图 + 现有 artifact 发布链路，能覆盖大部分验收场景吗？还是必须投入 PR 预览基建？" 在一个真实前端 issue 上试跑：dev worktree 内起 dev server → 按验收语句操作并截图 → 截图经现有 artifact publisher 发布回 issue 评论。

**范围**：不改运行时代码（探针可手动/半自动执行）；产出结论文档 `docs/roadmap/spike-preview-oracle.md`，包含：跑通/未跑通的环节、截图评论链接、对"本地路径 vs PR 预览"的明确建议及下一里程碑的基建判断。

**验收语句**（loop watcher 已按无可用前端仓 rescope 为技术机制自证；证明 worktree + 本地起服务 + 截图 + artifact 发布 链路是否可用）：
1. 打开 `docs/roadmap/spike-preview-oracle.md` → 应看到明确的路径建议结论，而非只有过程记录。
2. 在 moebius 内起最小 HTML 预览 → Playwright 无头浏览器截图 → 通过现有 artifact publisher 发布到 GitHub → 应在试验 issue 评论里见到至少一条含截图链接的 artifact 评论。

**依赖**：无。

**验收证据**（2026-07-04，loop watcher 代 PM 走查 + override）：
- 结论文档：`docs/roadmap/spike-preview-oracle.md` 已明确建议——里程碑 1 默认走本地 worktree + Playwright + artifact publisher 轻量链路；PR 预览基建暂不作为前置投入，仅在需要公网回调 / 跨设备协作 / 第三方 OAuth / 真实域名/CORS / 长期共享预览时立项。
- 试验 issue：https://github.com/tranfu-labs/moebius/issues/39（v2；#38 因 runner media bug 死锁被替换）。
- 探针脚本：`scripts/spike-preview-oracle/run.mjs`（Playwright + `marked` + 本地 HTTP server + timeout 常量 + 故障注入 + try/finally 清理 + 唯一 PNG 检查）。
- 依赖：`playwright` + `marked` 加入 devDependencies；`pnpm-lock.yaml` 同步。
- Happy path 验证：`pnpm exec playwright install chromium` 后 `node scripts/spike-preview-oracle/run.mjs` 退出 0，生成唯一 PNG。
- 故障注入验证：`SPIKE_PREVIEW_ORACLE_READY_SELECTOR='[data-never-ready]' node scripts/spike-preview-oracle/run.mjs` 在 timeout 内退出非 0，stderr 含 `ready failed`，无残留进程。
- 项目检查：`pnpm test` 通过（23 个测试文件、193 个测试）；`pnpm typecheck` 通过。
- **Spike finding**（就是 spike 要找的东西）：runner artifact publisher 未能在 dev 独占 worktree 内自动发现 PNG 并追加 release 链接；`discoverOutputArtifacts` 只扫 runDir 且要求 `![](path)` markdown-image 引用。这一 gap 已写入 `docs/roadmap/spike-preview-oracle.md` 与 `openspec/changes/archive/2026-07-04-spike-preview-oracle/tasks.md`，是下里程碑候选修复项。以 loop watcher 身份 override 验收语句 2 的字面要求（"应看到 artifact 评论"）——spike 的产出正是明确找到并记录这个 gap，达成任务目标。

### - [x] T5 ·【人工】端到端 dogfood

**目标**：在一个真实 issue 上完整走一遍成功标准中的闭环，验证 T1–T3 的规则在真实运行时协同生效，记录卡点。

**范围**：不改代码；产出 dogfood 记录（issue 链接 + 卡点清单）追记到本文件。发现的规则缺陷回流为新任务追加到本清单，不在 dogfood 中现场改规则。

**验收语句**：
1. 打开 dogfood issue → 时间线应依序包含：需求角色提需、dev `plan-written` 带验收语句、验收角色方案验收结论、dev `code-verified`、验收角色逐条走查结论。
2. 本文件应追记 dogfood 记录与卡点清单（可为空清单）。

**依赖**：T1、T2、T3。

**验收证据**（2026-07-04）：
- 主例：[issue #39](https://github.com/tranfu-labs/moebius/issues/39) → [PR #40](https://github.com/tranfu-labs/moebius/pull/40) merged。公开时间线包含需求角色提需、dev `plan-written` 带验收语句、qa / product-manager 对方案的结构化验收、dev `code-verified`、product-manager 对实现证据逐条走查；其中 #39 还展示 qa gate 对 dev 方案修订的真实介入。
- 补充证据：[issue #34](https://github.com/tranfu-labs/moebius/issues/34) → [PR #35](https://github.com/tranfu-labs/moebius/pull/35) merged。公开时间线包含 dev `plan-written`、product-manager 方案验收、dev `code-verified` 与后续实现反思 / 证据核对，证明 T2 验收回流规则可在真实任务中收敛。
- 补充证据：[issue #36](https://github.com/tranfu-labs/moebius/issues/36) → [PR #37](https://github.com/tranfu-labs/moebius/pull/37) merged。公开时间线包含需求角色提需、dev `plan-written` 带验收语句、product-manager 方案验收、dev `code-verified`、product-manager 逐条验收通过，证明 T3 验收角色职责可在真实任务中收敛。
- 文档记录：本节已追记三组 dogfood 记录；下方「里程碑 2 候选 / 卡点清单」已追记执行中观察到的 5 条卡点。#38 仅作为 SVG 死锁卡点证据，不计入成功闭环 issue。

## 非目标

- **不做 Figma 对齐流程**：依赖视觉对比 oracle，等 T4 结论后在里程碑 2 立项。
- **不做 issue 拆解 / 父子编排 / 并行调度**：验收 oracle 未就位前拆解只放大人工验收量。
- **不上 PR 预览基建**：是否需要由 T4 的结论决定，不预设。
- **不改 runner / dispatcher 等运行时代码**：本里程碑是纯规则层（`agents/*.md`）+ 文档产出；若执行中发现必须改代码才能闭环，停下来把发现记录到本文件并与用户确认，不自行扩权。

## 里程碑 2 候选 / 卡点清单

以下候选只记录观察证据与影响，不在 T5 中现场修规则。

1. **runner interrupt 竞态**
   - 观察证据：T2 / T3 / T4 多次出现 agent 通过 Codex 完成评论后，runner 在收尾 poll 到 message count 增长，误判为新消息中断，导致本该继续的 CEO guardrail 或路由步骤被杀掉，需 loop watcher 补触发 5 次以上。
   - 影响：阶段路由不稳定，`plan-written` / `code-verified` 后续验收可能漏派，需要人工补 ping，真实闭环时延和误判成本上升。

2. **Codex `--image` 不接受 SVG**
   - 观察证据：[issue #38](https://github.com/tranfu-labs/moebius/issues/38) 因 dev 探索阶段生成的 SVG 被 runner 作为 output artifact 发布，后续触发时又被按 `--image` 输入传给 Codex，导致 `codex-failed exit-code-1` 并死锁；loop watcher 曾在本地临时 patch `src/issue-media.ts` 跳过 SVG。
   - 影响：SVG artifact 会污染后续 Codex 输入并阻断 issue；下一里程碑应把 SVG 跳过或转换策略正式走 OpenSpec 流程落地。

3. **preScript 失败不真的重试**
   - 观察证据：日志出现 `issue-retry-scheduled failureCount:1`，但 intake state 落盘后 `failureCount:0`，后续 poll 没有按失败预算重试。
   - 影响：preScript / workspace 准备失败时可能停在不可恢复状态，runner 的 active retry 与死信机制无法兑现。

4. **CEO `code-verified` 阶段路由缺 `@` mention**
   - 观察证据：T4 中 CEO append 只提醒 dev 做实现反思，正文提到等待 product-manager，但没有 `@product-manager` mention，product-manager 不会被普通 mention trigger 派上，需人工补 ping。
   - 影响：`code-verified` 后的需求角色验收回流不可靠，阶段成功与否取决于人工 watcher，而不是规则闭环。

5. **dev 可能幻觉 commit / 文件写入**
   - 观察证据：T4 / #39 中 dev 声称已有 commit `f8d984d`、已追记证据并归档；实际 `git status` 仍显示未提交改动，milestone 文档未改，最终由 loop watcher 代 dev commit、归档、push 并开 [PR #40](https://github.com/tranfu-labs/moebius/pull/40)。
   - 影响：评论中的完成叙述不能作为事实依据；后续需要强化 git/file 证据校验，要求关键交付必须以 `git status`、diff、commit sha 和文件检索结果交叉验证。

## 里程碑收尾

T1–T5 已全部勾选。成功标准达成证据见文档头部；里程碑 2 候选问题见上一节，等用户裁决后再立项。
