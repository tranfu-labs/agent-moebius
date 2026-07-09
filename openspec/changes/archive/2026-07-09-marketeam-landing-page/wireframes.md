# Wireframes：marketeam-landing-page

> 新页，无既有 `docs/wireframes/pages/` 基线；归档时回流为 `docs/wireframes/pages/marketeam-landing.md`。

## pages/marketeam-landing.md

全视口 hero：header + 左文案 + 右圆环可视化 + 底部合作方 logo 滚动条。背景为 CSS mesh 渐变（深底 `#060218` + 紫粉光晕）。

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

头像 hover 标注框（占位即交接物：hover 出该头像的 AI 生成提示词）：

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

9 头像轨位速查（角度/半径/尺寸/形状/光晕，对应 design.md 身份与提示词）：

```text
轨1 353  270° r177  方圆角  紫   MC Maya Chen
轨2 501   60° r251  圆      黄   LN Liam Novak
轨2 501  180° r251  圆 78   粉   AR Aisha Rahman
轨2 501  300° r251  方圆角  蓝   KT Kenji Tanaka
轨3 649  130° r325  圆 88   粉   SR Sofia Ramirez
轨4 797   30° r399  圆      紫   NB Noah Bennett
轨4 797   95° r399  方圆 88 橙   PN Priya Nair
轨4 797  220° r399  方圆 88 粉   ZA Zara Ahmed
轨4 797  320° r399  圆      紫   LM Lucas Meyer
```

## 流转（回流 flow.md 用）

```text
打开 sites/marketeam/index.html
  │
  ├─ 背景 CSS mesh 渐变铺满 .app
  ├─ 入场动画错峰：header 下淡入 → hero 左上淡入 → 圆环 scale-in(0.3s) → ticker 上淡入(0.6s)
  ├─ 400ms 起 打字机逐字（35ms/字，前67字黑/余白，紫光标闪）
  │     └─ 打字完 → Start Project(3.2s) → David 徽章(3.6s) 依次入场
  ├─ 1.2s 起 中心数字 count-up 0→20k+（easeOutCubic 2s）
  ├─ 4 轨持续旋转（左30/右40/右50/左60 s），头像随轨转、中心数字反向自转正立
  ├─ 头像错峰 fly-in（scale0.3+rotate-180+blur → 正常，0.6→2.3s）
  │     └─ hover 头像 → 弹标注框（姓名·角色 + AI 生成提示词 + 复制）
  └─ 底部 ticker 5 标×4 无缝左滚 20s，两端渐隐
```
