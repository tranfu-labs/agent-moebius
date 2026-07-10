# Landing Page Wireframe（agent-moebius）

落地页 `sites/marketeam/index.html`（目录名 `marketeam` 为早期样例遗留）是自包含单文件：全视口 hero + 首屏下方正文，首屏与正文均如实呈现 agent-moebius。header + 左文案 + 右圆环可视化 + 底部角色工牌架；背景为 CSS mesh 渐变（深底 `#060218` + 紫粉光晕）。首屏圆环即 AI 角色团队：**CEO 居中、6 角色绕轨**（节点为简化版员工工牌），hover 出角色真实 charter。角色统一以**员工工牌（全息档）**呈现，见文末「角色工牌 + 底部工牌架」。

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
│  ‹渐隐  ╱▌╱▌╱▌╱▌╱▌╱▌╱▌  7 工牌侧立斜插  渐隐›            │ 工牌架
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
│ ‹ ╱▌╱▌╱▌╱▌ 工牌架 ›            │ 工牌架
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

首屏 hero 之下的同页长滚动正文，如实介绍本项目 agent-moebius。每段滚入视口时一次性淡入（IntersectionObserver，prefers-reduced-motion 降级为直接显示）。复用首屏设计系统：药丸+旋转描边按钮、紫 mesh/光晕、员工工牌 + hover 弹框。

```text
① What is agent-moebius
   eyebrow: MEET AGENT-MOEBIUS
   H2: An AI team that ships from your own machine.
   副文 + 3 芯片: [Runs locally · codex+gh][Driven by GitHub issues][A whole AI team, not one bot]

② How it works —— 真实运行闭环（横排带连接线，≤768 纵向堆叠）
   ①Watch →②Normalize →③Trigger →④Guard →⑤Track
   扫描open  归一化    @mention   CEO      交棒 plan-written→
   issue    speaker时间线 触发本机codex  guardrail校正 code-verified→账本验收

③ Your AI team —— 7 真实角色，完整员工工牌网格（见文末工牌解剖）
   [CEO Orchestrates&guards][secretary Keeps the rules][dev Writes the code][dev-manager Tech lead]
   [product-manager Shapes the ask][qa Breaks the plan][hermes-user The user's voice]
   每张为工牌（缩写色卡+角色名+charter+agent-moebius+条形码），hover 出 ≤±6° tilt + 全息 foil

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

## 角色工牌 + 底部工牌架（全息档）

角色统一以「员工工牌」呈现：③为完整工牌网格，首屏圆环节点为简化版工牌。工牌解剖：

```text
   ╭┈┈┈╮      顶部卡槽/打孔（无长挂绳）
  ┌┴───┴┐
  │┌───┐│     头像 = 缩写色卡（底色=光晕色）
  ││DEV││
  │└───┘│
  │ dev  │     姓名 = 角色名
  │Writes│     职位 = charter
  │◆a-m ▐▌│    公司标 agent-moebius + 条形码
  └──────┘
  hover：±6° tilt + 光泽扫过 + 全息 foil 随鼠标流动；prefers-reduced-motion 降级静态
```

底部工牌架（借黑胶唱片架动效，主体是工牌，无黑胶碟）三态：

```text
默认：7 工牌侧立斜插（rotateY≈44°）叠放，两端渐隐，侧面露缩写色卡
  ╱▌╱▌╱▌╱▌╱▌╱▌╱▌   CEO SEC DEV DM PM QA HU

hover：目标工牌【只垂直抬起 translateY-26】，角度不变、不转正、不放大
        ╱▌
  ╱▌╱▌   ╱▌╱▌╱▌

点击/Enter：弹簧容器变形（linear() 烘焙弹簧，460ms）——工牌快攻飞抵弹窗内工牌位、~2% 微过冲咬合落定（无贝塞尔死尾），转正由快弹簧前半程完成（拿起读感），途中简化卡面渐变为完整工牌；变形面同弹簧从足迹长成面板，【此时才显示正面】；关闭 280ms 逆向弹簧：临近插槽才侧立落回
  ┌──────────────────────────────────┐
  │  ┌正面工牌┐  DEV-MANAGER      [✕] │
  │  │ DM     │  dev-manager         │
  │  │dev-mgr │  Owns technical …     │
  │  │◆a-m ▐▌ │  @dev-manager → …     │
  │  └────────┘                      │
  └──────────────────────────────────┘
  Esc/遮罩/关闭按钮可关；键盘可达；prefers-reduced-motion 去大位移
```
