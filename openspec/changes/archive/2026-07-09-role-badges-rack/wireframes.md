# Wireframes：role-badges-rack

> 基线：`docs/wireframes/pages/marketeam-landing.md`。本 change 把角色视觉升级为员工工牌、把底部技术栈条替换为工牌架。归档时回流。

## 员工工牌解剖（全息档）

```text
   ╭┈┈┈╮      顶部打孔/卡槽（无长挂绳）
  ┌┴───┴┐
  │┌───┐│     头像区 = 角色缩写色卡（底色=光晕色）
  ││DEV││
  │└───┘│
  │ dev  │     姓名位 = 角色名
  │Writes│     职位位 = charter
  │◆a-m ▐▌▐│   公司标 agent-moebius + 条形码
  └──────┘
  hover: ±6° tilt + 光泽扫过 + 全息 foil 随鼠标流动
```

## 底部工牌架（借黑胶唱片架动效；主体是工牌）

默认态——工牌侧立斜插、叠放（看到的是侧/斜面，露缩写色卡）：

```text
底部 rack（perspective 侧立）:
   ╱▌╱▌╱▌╱▌╱▌╱▌╱▌     ← 7 张工牌斜插，负 margin 叠放
   CEO SEC DEV DM PM QA HU  （侧面仅露缩写色卡）
   ‹渐隐 ……………………………… 渐隐›
```

hover 某张——**只垂直抬起，不转正**（仍侧立）：

```text
        ╱▌ ← 抬起 translateY-26（+提亮/z顶起），角度不变
   ╱▌╱▌   ╱▌╱▌╱▌
```

点击某张——**才显示正面** + 详情弹窗：

```text
  ┌────────────────────────────────────┐
  │                              [✕]    │
  │  ┌──────┐   DEV · Writes the code   │
  │  │┌──┐  │   dev                     │
  │  ││DEV│ │   The only role with      │
  │  │└──┘  │   write access to the     │
  │  │ dev  │   issue worktree; …       │
  │  │◆a-m▐▌│   @dev → mention in issue │
  │  └──────┘   (正面放大工牌 + 全息)    │
  └────────────────────────────────────┘
```

## 流转（回流 flow.md 用）

```text
角色视觉 = 员工工牌（全息档）：③网格=完整工牌；首屏圆环=简化版工牌；hover 出 ±6° tilt + foil
底部（原技术栈条）→ 工牌架：
  ├─ 默认：7 工牌侧立斜插叠放，两端渐隐，侧面露缩写色卡
  ├─ hover：目标工牌只垂直抬起（不转正、不放大）+ 轻提亮
  └─ 点击：弹详情弹窗，显示正面放大工牌 + 角色名/charter/@用法（Esc/遮罩/按钮关，键盘可达）
  prefers-reduced-motion：去大位移与 foil 流动，保留静态
```
