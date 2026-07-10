# 设计：marketeam-landing-sections

## 方案

### 载体与边界
- 只在 `sites/marketeam/index.html` 首屏（`.app` hero 区）**之后**追加 4 个 `<section>`；**不改动首屏任何现有结构/样式/脚本**。
- 背景延续：hero 之下正文区用同一深底 `#060218` + 紫粉光晕基调（可用更暗的纯色分段带出层次），保持一页连贯。
- 复用既有设计令牌与组件：`--border-angle` 旋转描边药丸按钮、紫 `#A068FF` 强调、hairline 卡片、`count-up`、头像卡（渐变卡+首字母）+ hover 弹框。
- 不引第三方图片、不加构建依赖；仅外链仍是 Google Fonts。

### 新增唯一机制：滚动进场
- 一个原生 `IntersectionObserver`：给带 `data-reveal` 的元素在进入视口时加 `.is-visible`，触发 `translateY(24px)+opacity0 → 0/1`，`cubic-bezier(0.22,1,0.36,1)`，只触发一次（`unobserve`）。错峰用 `transition-delay` 或子元素序号。
- 尊重 `prefers-reduced-motion`：减弱时直接显示、不位移。

### 文案总原则
- 英文，与首屏同语言；内容**忠于**下列真实事实源，NEVER 编造功能/数字。允许把中文事实源转述为够意思的英文短句。
- 事实源：`AGENTS.md` 项目概览、`docs/roadmap/*`、`agents/*.md`、`src/goal-ledger.ts`、`src/stages.ts`。

---

## 分节内容（含逐字英文文案，subagent 照用）

### ① What is agent-moebius —— 定位
- eyebrow：`Meet agent-moebius`
- H2：`An AI team that ships from your own machine.`
- 副文：`It watches your GitHub issues. @mention a role and it runs Codex locally to do the work — while a CEO guards quality and a goal ledger tracks every task through to acceptance.`
- 三个概念芯片（内联 SVG 小图标 + 文案）：
  - `Runs locally · codex + gh`
  - `Driven by GitHub issues`
  - `A whole AI team, not one bot`

### ② How it works —— 真实闭环（替换任何虚构三步）
- H2：`How it works`
- 5 步流水（横向带连接线，窄屏纵向堆叠），每步：序号 + 标题 + 一行：
  1. `Watch` — `Scans open issues across your whitelisted repos.`
  2. `Normalize` — `Folds issue body + comments into one speaker-tagged timeline.`
  3. `Trigger` — `An @mention decides whether to run local Codex — and drops a 👀 as instant feedback.`
  4. `Guard` — `The CEO reviews and corrects every agent reply before it's posted via gh.`
  5. `Track` — `Handoffs (plan-written → code-verified) carry the work through the goal ledger to acceptance.`
- 依据：AGENTS.md 项目概览（扫描/归一化时间线/mention 触发/eyes reaction/本机 codex/CEO guardrail 校正/gh 回帖）、`src/stages.ts`（plan-written、code-verified、in-progress）、里程碑 1（验收回流）。

### ③ Your AI team —— 7 个真实角色（本次唯一强复用首屏视觉的一节）
- H2：`Your AI team`
- 副文：`Address any of them by @mention inside an issue.`
- 7 张角色卡，视觉复用头像卡（渐变卡 + 角色缩写/图标）；**hover 弹框显示「角色名 + 真实 charter」**（复用首屏 tooltip 组件，但去掉复制按钮——charter 是介绍不是可复制素材）。卡面显示角色名 + 短标签，hover 出 charter 全句。角色缩写与建议光晕色如下：
  | 角色 | 卡面短标签 | hover charter（逐字） | 光晕色 |
  |---|---|---|---|
  | CEO | Orchestrates & guards | `Reviews and corrects every agent's reply, routes handoffs, and enforces the process gates.` | 紫 #A068FF |
  | secretary | Keeps the rules | `Maintains and evolves the CEO's guardrail rules.` | 蓝 |
  | dev | Writes the code | `The only role with write access to the issue worktree; implements and verifies changes.` | 绿 |
  | dev-manager | Tech lead | `Owns technical decisions, architecture choices and quality — without writing code.` | 橙 |
  | product-manager | Shapes the ask | `Turns intent into clear product requirements.` | 粉 |
  | qa | Breaks the plan | `Adversarially reviews the plan before any code is written, against the invariants oracle.` | 黄 |
  | hermes-user | The user's voice | `Stands in for the end user — the Hermes persona.` | 青 |
- 依据：`agents/ceo.md`/`secretary.md`/`dev.md`/`dev-manager.md`/`product-manager.md`/`qa.md`/`hermes-user.md` 与 AGENTS.md 角色注释。charter 文案 MUST 与上表逐字一致。

### ④ Goal ledger + 过程保证 + 收尾
- H2：`From goal to acceptance — tracked end to end`
- 副文：`A goal ledger records every goal → milestone → task → phase, with plan-before-code and explicit acceptance gates.`
- 链路小图（内联 SVG / CSS，四节点带箭头）：`goal → milestone → task → phase`
- 三个事实芯片：`plan-written → code-verified` · `explicit acceptance gates` · `runs on your machine`
- CTA：`Get started →`（复用 Start Project 药丸 + 旋转描边样式）
- Footer：agent-moebius 文字标（可复用/微调首屏菱形标）+ 三列链接占位（Product / Docs / GitHub，`#` 占位）+ `© 2026 agent-moebius`
- 依据：里程碑 3（目标账本 + 编排者）、`src/goal-ledger.ts`（goal/milestone/task/phase、验收语句、ready gate、阶段切换）。

---

## 响应式
- 4 节都随既有断点（1280/1024/768/480）自适应：多列网格在 ≤768 收成单列，②流水在窄屏纵向堆叠，标题逐档缩小。
- MUST NOT 产生页面横向滚动（沿用首屏已验证的约束）。

## 权衡
- **同页长滚动 vs 拆多页**：本期选同页长滚动，保住单文件自包含、双击即开；nav 独立路由页留待后续。
- **③ hover 内容换成 charter**：首屏 hover 是「照片生成提示词」（占位交接物），③ 的对象是 agent 角色不是要拍照的人，故 hover 改承载真实 charter，交互组件复用、语义对齐本节。
- **接受品牌错位**：hero 仍是 Marketeam 壳。本期调试样例优先验证「正文如实介绍项目」这套模式，换 hero 是独立后续决策。

## 风险
- 正文文案若脱离事实源就失去本次意义——已在本 design 逐字钉死英文文案与 charter，subagent MUST 照用、不得自行发挥。
- 滚动进场在 `prefers-reduced-motion` 下需降级，避免晕动；已在机制里声明。
