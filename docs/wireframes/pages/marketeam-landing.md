# Landing Page Wireframe（agent-moebius）

落地页 `sites/marketeam/index.html`（目录名 `marketeam` 为早期样例遗留）是自包含单文件：全视口 hero + 首屏下方正文，首屏与正文均如实呈现 agent-moebius。header + 左文案 + 右圆环可视化 + 底部技术栈滚动条；背景为 CSS mesh 渐变（深底 `#060218` + 紫粉光晕）。首屏圆环即 AI 角色团队：**CEO 居中、6 角色绕轨，hover 出角色真实 charter**（不再是营销人像/照片提示词）。

桌面态：

```text
┌────────────────────────────────────────────────────────────┐
│ ◆agent-moebius  Overview How it works Docs GitHub  GitHub [Get started]│ header
│                                                    ↑白   ↑黑药丸+旋转描边 │
│  ┌────────────────────────┐        ╭──── 6 角色绕轨 ────╮     │
│  │ @mention a role.       │       ╭ DEV  QA   PM  ... ╮ │     │ 打字机:
│  │ Your AI team ships it. │      │    ╭─────────╮      │ │     │ 「@mention a role.」深
│  │ (深/白双色 + 紫光标)    │      │    │  CEO    │      │ │     │ 「Your AI team ships it.」白
│  │ Runs Codex on your …   │      │    │orchestr.│      │ │     │ 中心=CEO(无 count-up)
│  │ [ Get started → ]      │      │    ╰─────────╯      │ │     │
│  │      ▷[ @ceo ]          │       ╰ SEC  DM   HU ─────╯ │     │ @ceo mention 芯片
│  └────────────────────────┘        ╰──────────────────╯     │
│  ‹ Node.js · TypeScript · Codex · gh · Electron 左滚20s ›    │ 技术栈 ticker
└────────────────────────────────────────────────────────────┘
```

角色 hover 弹框（复用 tooltip，charter 内容，无复制按钮）：

```text
   [QA]  ←缩写色卡（底色=该角色光晕色）
    │hover
    ▼
  ┌────────────────────────────────────────────┐
  │ qa · Breaks the plan                       │
  │ ────────────────────────────────────────── │
  │ Adversarially reviews the plan before any  │
  │ code is written, against the invariants    │
  │ oracle.                                    │
  └────────────────────────────────────────────┘
```

堆叠态（≤1024，标题在上、圆环在下，逐档缩小；≤768 隐藏 nav；无横向滚动）：

```text
┌───────────────────────────────┐
│ ◆agent-moebius   GitHub [Get s]│ header（≤768 nav 隐藏）
│                               │
│ @mention a role.              │ 标题 1024:48 / 768:36 / 480:28
│ Your AI team ships it.▏       │
│ Runs Codex on your machine…   │
│ [ Get started → ]  ▷[@ceo]    │
│                               │
│        ╭ 圆环缩放 ╮            │ 1280:.85 1024:.7 768:.5 480:.4
│        │   CEO    │            │ 中心 CEO + 6 角色绕轨
│        │orchestr. │            │
│        ╰──────────╯            │
│ ‹ Node.js·TypeScript·Codex… ›  │ 技术栈 ticker
└───────────────────────────────┘
```

首屏圆环角色速查（CEO 居中 + 6 绕轨；缩写/短标签/光晕/charter 见归档 change design.md）：

```text
中心   CEO  Orchestrates & guards  紫
绕轨   SEC  Keeps the rules        蓝
绕轨   DEV  Writes the code        绿
绕轨   DM   Tech lead              橙
绕轨   PM   Shapes the ask         粉
绕轨   QA   Breaks the plan        黄
绕轨   HU   The user's voice       青
```

## 首屏下方正文（如实介绍 agent-moebius）

首屏 hero（Marketeam 营销壳）之下的同页长滚动正文，如实介绍本项目 agent-moebius。每段滚入视口时一次性淡入（IntersectionObserver，prefers-reduced-motion 降级为直接显示）。复用首屏设计系统：药丸+旋转描边按钮、紫 mesh/光晕、头像卡 + hover 弹框。

```text
① What is agent-moebius
   eyebrow: MEET AGENT-MOEBIUS
   H2: An AI team that ships from your own machine.
   副文 + 3 芯片: [Runs locally · codex+gh][Driven by GitHub issues][A whole AI team, not one bot]

② How it works —— 真实运行闭环（横排带连接线，≤768 纵向堆叠）
   ①Watch →②Normalize →③Trigger →④Guard →⑤Track
   扫描open  归一化    @mention   CEO      交棒 plan-written→
   issue    speaker时间线 触发本机codex  guardrail校正 code-verified→账本验收

③ Your AI team —— 7 真实角色（复用头像卡 + hover）
   [CEO Orchestrates&guards][secretary Keeps the rules][dev Writes the code][dev-manager Tech lead]
   [product-manager Shapes the ask][qa Breaks the plan][hermes-user The user's voice]
   hover 弹框：角色名·短标签 + 真实 charter（复用首屏 tooltip，无复制按钮）

④ Goal ledger + CTA + Footer
   H2: From goal to acceptance — tracked end to end
   [goal] → [milestone] → [task] → [phase]
   [plan-written→code-verified][explicit acceptance gates][runs on your machine]
   [ Get started → ]（复用 Start Project 药丸）
   footer: ◆agent-moebius + Product/Docs/GitHub 三列 + © 2026 agent-moebius
```

角色 hover 弹框（复用首屏 tooltip，内容换成真实 charter）：

```text
   [QA]
    │hover
    ▼
  ┌────────────────────────────────────────────┐
  │ qa · Breaks the plan                       │
  │ ────────────────────────────────────────── │
  │ Adversarially reviews the plan before any  │
  │ code is written, against the invariants    │
  │ oracle.                                    │
  └────────────────────────────────────────────┘
```

7 角色 charter 速查（逐字，源 agents/*.md）：

```text
CEO             Orchestrates & guards  紫  Reviews and corrects every agent's reply, routes handoffs, and enforces the process gates.
secretary       Keeps the rules        蓝  Maintains and evolves the CEO's guardrail rules.
dev             Writes the code        绿  The only role with write access to the issue worktree; implements and verifies changes.
dev-manager     Tech lead              橙  Owns technical decisions, architecture choices and quality — without writing code.
product-manager Shapes the ask         粉  Turns intent into clear product requirements.
qa              Breaks the plan        黄  Adversarially reviews the plan before any code is written, against the invariants oracle.
hermes-user     The user's voice       青  Stands in for the end user — the Hermes persona.
```
