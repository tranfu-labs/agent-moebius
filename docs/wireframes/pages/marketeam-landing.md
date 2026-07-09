# Marketeam Landing Page Wireframe

Marketeam 营销落地页（`sites/marketeam/index.html`）是自包含单文件全视口 hero：header + 左文案 + 右圆环可视化 + 底部合作方 logo 滚动条。背景为 CSS mesh 渐变（深底 `#060218` + 紫粉光晕）。头像第一版为「光晕色渐变卡 + 姓名首字母」占位，hover 交出该头像的 AI 生成提示词（占位即交接物）。

桌面态：

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆Marketeam   Your Team  Solutions  Blog  Pricing        Log In  [ Join Now ]│ header
│                                                          ↑白    ↑黑药丸+旋转描边 │
│  ┌────────────────────────────┐            ╭─────── orbit4 797 左旋60s ───────╮ │
│  │ Unlock Top Marketing       │        ╭───┴ orbit3 649 右旋50s ───────────╮ │ │
│  │ Talent You Thought Was     │      ╭─┴ orbit2 501 右旋40s ──────────────╮│ │ │
│  │ Out of Reach — Now Just    │     │  (LN)   ╭ orbit1 353 左旋30s ╮  (KT) ││ │ │
│  │ One Click Away!▏           │     │        │      20k+          │       ││ │ │
│  │ └前67字黑─┘ └───白───┘打字机 │    (AR)      │   Specialists      │  (SR) ││ │ │
│  │                            │     │        ╰──────(MC)──────────╯       ││ │ │
│  │  [ Start Project    → ]     │     │  (NB)                        (PN)  ││ │ │
│  │        ▷[ David ]           │      ╰──(LM)──────────────(ZA)──────────╯│ │ │
│  └────────────────────────────┘        ╰──────────────────────────────────╯ │ │
│                                            ╰──────────────────────────────────╯ │
│  ‹渐隐  [logo1][logo2][logo3][logo4][logo5][logo1]… 无限左滚20s  渐隐›          │ ticker
└──────────────────────────────────────────────────────────────────────────────┘
```

头像 hover 标注框（hover 出该头像的 AI 生成提示词 + 复制）：

```text
   (MC)  ←首字母色卡占位（底色=该位光晕色，此处紫）
    │hover
    ▼
  ┌────────────────────────────────────────────────┐
  │ Maya Chen · Brand Strategist                   │
  │ ────────────────────────────────────────────── │
  │ 🅐 AI 生成提示词                          [ 复制 ] │
  │ Photorealistic head-and-shoulders portrait of  │
  │ a confident East-Asian woman, early 30s, brand │
  │ strategist… soft violet (#A068FF) rim light,   │
  │ deep #060218 studio backdrop, 85mm, square crop│
  └────────────────────────────────────────────────┘
```

堆叠态（≤1024，标题在上、圆环在下，逐档缩小；≤768 隐藏 nav；无横向滚动）：

```text
┌───────────────────────────────┐
│ ◆Marketeam        Log In [Join]│ header（≤768 nav 隐藏）
│                               │
│ Unlock Top Marketing Talent   │
│ You Thought Was Out of Reach  │ 标题 1024:48 / 768:36 / 480:28
│ — Now Just One Click Away!▏   │
│ [ Start Project  → ]  ▷[David] │
│                               │
│        ╭ 圆环缩放 ╮            │ 1280:.85 1024:.7 768:.5 480:.4
│        │  20k+    │            │
│        │Specialists│           │
│        ╰──────────╯            │
│ ‹ [logo][logo][logo]… ›        │ ticker
└───────────────────────────────┘
```

9 头像轨位速查（角度/半径/尺寸/形状/光晕，身份与 AI 提示词见归档 change 的 design.md）：

```text
轨1 353  270° r177  方圆角  紫   MC Maya Chen · Brand Strategist
轨2 501   60° r251  圆      黄   LN Liam Novak · Growth Lead
轨2 501  180° r251  圆 78   粉   AR Aisha Rahman · Social Media Director
轨2 501  300° r251  方圆角  蓝   KT Kenji Tanaka · Performance Marketer
轨3 649  130° r325  圆 88   粉   SR Sofia Ramirez · Content Strategist
轨4 797   30° r399  圆      紫   NB Noah Bennett · SEO Specialist
轨4 797   95° r399  方圆 88 橙   PN Priya Nair · Creative Director
轨4 797  220° r399  方圆 88 粉   ZA Zara Ahmed · Email/CRM Marketer
轨4 797  320° r399  圆      紫   LM Lucas Meyer · Paid Media Buyer
Hero 左光标徽章                  紫   David · Account Lead
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
