# Wireframes：marketeam-landing-sections

> 基线：`docs/wireframes/pages/marketeam-landing.md`（首屏 hero）。本 change 在其下方追加 4 节正文，归档时回流进同一页文件。

## pages/marketeam-landing.md（追加：首屏下方正文）

首屏 hero 之下的同页长滚动正文，如实介绍 moebius。每段滚入视口时淡入（IntersectionObserver）。

```text
┌ 首屏 hero(已完成，本期不动)───────────────┐
└─────────────────────────────────────────────┘ ↓ 滚动淡入

① What is moebius
┌─────────────────────────────────────────────┐
│  Meet moebius                          │
│  An AI team that ships from your own machine.│
│  It watches your GitHub issues. @mention a   │
│  role and it runs Codex locally …            │
│  [◍ Runs locally · codex+gh]                 │
│  [◍ Driven by GitHub issues]                 │
│  [◍ A whole AI team, not one bot]            │
└─────────────────────────────────────────────┘

② How it works —— 真实闭环
┌─────────────────────────────────────────────┐
│  How it works                                │
│  ①Watch →②Normalize →③Trigger →④Guard →⑤Track│
│   扫描open   归一化    @mention    CEO      交棒→   │
│   issue     时间线    触发codex   校正      账本验收 │
└─────────────────────────────────────────────┘  窄屏纵向堆叠

③ Your AI team —— 7 真实角色（复用头像卡+hover）
┌─────────────────────────────────────────────┐
│  Your AI team                                │
│  Address any of them by @mention in an issue.│
│  [CEO ][secretary][dev ][dev-manager]        │
│  [PM  ][qa       ][hermes-user]              │
│    ↑hover 弹框：角色名 + 真实 charter（无复制） │
└─────────────────────────────────────────────┘

④ Goal ledger + CTA + Footer
┌─────────────────────────────────────────────┐
│  From goal to acceptance — tracked end to end│
│  goal → milestone → task → phase             │
│  [plan-written→code-verified][acceptance gates][local]│
│           [ Get started → ]  (复用按钮)       │
│  ─────────────────────────────────────────── │
│  ◆moebius   Product  Docs  GitHub      │
│                     © 2026 moebius     │
└─────────────────────────────────────────────┘
```

③ 角色 hover 弹框（复用首屏 tooltip 组件，内容换成真实 charter）：

```text
   [CEO]
    │hover
    ▼
  ┌────────────────────────────────────────────┐
  │ CEO · Orchestrates & guards                │
  │ ────────────────────────────────────────── │
  │ Reviews and corrects every agent's reply,  │
  │ routes handoffs, and enforces the process  │
  │ gates.                                     │
  └────────────────────────────────────────────┘
```

## 流转（回流 flow.md 用，接在 Marketeam Landing 段之后）

```text
首屏 hero 之下（同页滚动）
  │
  ├─ 每段 IntersectionObserver 滚入淡入（一次性；prefers-reduced-motion 降级为直接显示）
  ├─ ① 是什么：定位一句话 + 3 概念芯片
  ├─ ② 怎么跑：Watch→Normalize→Trigger→Guard→Track 真实闭环
  ├─ ③ AI 团队：7 角色卡，hover 出角色真实 charter（复用首屏 tooltip，无复制）
  └─ ④ 目标账本：goal→milestone→task→phase + 过程保证芯片 + Get started CTA + footer
```
