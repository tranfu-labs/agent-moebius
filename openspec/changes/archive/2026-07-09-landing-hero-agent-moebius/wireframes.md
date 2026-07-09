# Wireframes：landing-hero-agent-moebius

> 基线：`docs/wireframes/pages/marketeam-landing.md`（现有首屏 = Marketeam 壳）。本 change 把首屏改造为 agent-moebius，归档时替换该页「桌面态/堆叠态/9 头像速查」为下列内容；正文 4 节小节保持不动。

## pages/marketeam-landing.md（首屏改造后）

```text
┌────────────────────────────────────────────────────────────┐
│ ◆agent-moebius  Overview How it works Docs GitHub  GitHub [Get started]│ header
│  ┌────────────────────────┐        ╭──── 6 角色绕轨 ────╮     │
│  │ @mention a role.       │       ╭ DEV  QA   PM  ... ╮ │     │ 打字机:
│  │ Your AI team ships it. │      │    ╭─────────╮      │ │     │ 「@mention a role.」深
│  │ (深/白双色 + 紫光标)    │      │    │  CEO    │      │ │     │ 「Your AI team ships it.」白
│  │ Runs Codex on your …   │      │    │orchestr.│      │ │     │ 中心=CEO(无 count-up)
│  │ [ Get started → ]      │      │    ╰─────────╯      │ │     │
│  │      ▷[ @ceo ]          │       ╰ SEC  DM   HU ─────╯ │     │ @ceo mention 芯片
│  └────────────────────────┘        ╰──────────────────╯     │
│  ‹ Node.js · TypeScript · Codex · gh · Electron 左滚 ›       │ 技术栈 ticker
└────────────────────────────────────────────────────────────┘
   背景 CSS mesh 渐变 + 四轨旋转 + 入场动画,机制全保留
```

角色 hover 弹框（复用 tooltip，charter 内容，无复制）：

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

6 角色绕轨 + CEO 居中速查（缩写/短标签/光晕/charter 见归档 change design.md）：

```text
中心   CEO  Orchestrates & guards  紫
绕轨   SEC  Keeps the rules        蓝
绕轨   DEV  Writes the code        绿
绕轨   DM   Tech lead              橙
绕轨   PM   Shapes the ask         粉
绕轨   QA   Breaks the plan        黄
绕轨   HU   The user's voice       青
```

## 流转（回流 flow.md 用，替换 Marketeam Landing 段首屏部分）

```text
打开 sites/marketeam/index.html（agent-moebius 品牌）
  │
  ├─ 背景 CSS mesh 渐变 + 入场动画错峰（header/hero左/圆环/ticker）
  ├─ 400ms 起 打字机 "@mention a role. Your AI team ships it."（首句深/次句白 + 紫光标）
  │     └─ 打字完 → Get started(3.2s) → @ceo 芯片(3.6s)
  ├─ 圆环:CEO 居中(orchestrates & guards,无 count-up) + 6 角色绕轨,随轨转、反向自转正立
  │     └─ hover 角色 → charter 弹框（复用 tooltip,无复制）
  ├─ 底部 ticker: Node.js·TypeScript·Codex·gh·Electron 无缝左滚 20s,两端渐隐
  ├─ 断点 1280/1024/768/480:逐档缩,≤1024 堆叠,≤768 隐藏 nav,无横滚
  └─ 继续向下 → 正文 4 节（不变，如实介绍 agent-moebius）
```
