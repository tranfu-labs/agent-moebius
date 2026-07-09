# 设计：marketeam-landing-page

## 方案

### 载体与技术
- 单文件 `sites/marketeam/index.html`，一个文件内含全部 HTML / `<style>` / `<script>`，双击即可打开。
- 原生浏览器实现，无构建、无框架、无动画库。来源规格里的 React 构件对应翻译为：
  - `useCountUp` → 一个 `requestAnimationFrame` 计数函数（0→20，easeOutCubic，2s，延迟 1.2s 起）。
  - `TypewriterHeading` → 一个逐字追加的 `setTimeout` 循环（35ms/字，延迟 400ms 起）。
  - `@property --border-angle` → 原样用 CSS `@property` + `@keyframes` 实现旋转 conic 描边。
- 外链仅 Google Fonts：Inter(400/500/600/700) + Urbanist(600/700)。

### 自包含素材决策
| 素材 | 做法 |
|---|---|
| 背景 | CSS mesh 渐变复刻氛围：深底 `#060218` + `#A068FF`/紫粉径向光晕若干层，铺满 `.app` |
| Marketeam 品牌标 | 内联 SVG 文字标（wordmark）+ 菱形小标，高 32px |
| 5 个合作方标 | 内联 SVG 虚构品牌文字标：Northwind / Lumen / Vellum / Quartz / Habit，各 137×40 |
| 光标 / 箭头图标 | 内联 SVG |
| 9 个头像 | 占位 = 光晕色渐变卡 + 姓名首字母；见下「头像素材系统」 |

### 头像素材系统（本 change 的核心）
每个头像 DOM 挂 `data-name` / `data-role` / `data-prompt`。渲染为渐变色卡（底色取该位光晕色）+ 姓名首字母。**hover 弹出标注框**：显示姓名 · 角色、AI 生成提示词全文、一个「复制」按钮（`navigator.clipboard.writeText(prompt)`）。占位卡的光晕色 = 提示词里的 rim light 色，二者内在呼应。

9 个头像位置/尺寸/形状/光晕严格对齐来源规格；身份做人口多样性铺开。提示词统一模板，只换身份与光晕色，保证 9 张成套：

> `Photorealistic head-and-shoulders portrait of {身份}, a {角色}, {表情/气质}, {着装}. {光晕色}({hex}) rim light from one side, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, {裁切}, natural skin texture, looking {方向}.`

九位（+ David 光标徽章）身份与完整提示词，实现时逐字嵌入对应头像的 `data-prompt`：

1. **Maya Chen · Brand Strategist**（轨1 270° 紫 圆角方）
   `Photorealistic head-and-shoulders portrait of a confident East-Asian woman in her early 30s, a brand strategist, warm assured smile, minimalist charcoal blazer over a plain tee. Soft violet (#A068FF) rim light from the left, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, square crop with rounded corners, natural skin texture, looking straight at camera.`

2. **Liam Novak · Growth Lead**（轨2 60° 黄 圆）
   `Photorealistic head-and-shoulders portrait of a friendly white man in his late 20s, a growth marketing lead, relaxed grin, heather crewneck sweater. Warm amber-gold rim light from the right, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, round crop, natural skin texture, looking slightly off camera.`

3. **Aisha Rahman · Social Media Director**（轨2 180° 粉 圆 78px）
   `Photorealistic head-and-shoulders portrait of a bright South-Asian woman in her 30s wearing an elegant hijab, a social media director, approachable open expression, deep-teal blouse. Magenta-pink rim light from the left, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, round crop, natural skin texture, looking straight at camera.`

4. **Kenji Tanaka · Performance Marketer**（轨2 300° 蓝 圆角方）
   `Photorealistic head-and-shoulders portrait of a focused Japanese man in his 30s, a performance marketer, thoughtful calm expression, thin-frame glasses, slate button-up shirt. Cool blue rim light from the right, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, square crop with rounded corners, natural skin texture, looking slightly off camera.`

5. **Sofia Ramirez · Content Strategist**（轨3 130° 粉 圆 88px）
   `Photorealistic head-and-shoulders portrait of a creative Latina woman in her late 20s, a content strategist, warm inviting smile, rust-colored knit. Soft pink rim light from the left, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, round crop, natural skin texture, looking straight at camera.`

6. **Noah Bennett · SEO Specialist**（轨4 30° 紫 圆）
   `Photorealistic head-and-shoulders portrait of a composed Black man in his 30s, an SEO specialist, quietly confident expression, fine-knit charcoal turtleneck. Violet (#A068FF) rim light from the right, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, round crop, natural skin texture, looking straight at camera.`

7. **Priya Nair · Creative Director**（轨4 95° 橙 圆角方 88px）
   `Photorealistic head-and-shoulders portrait of an artistic South-Asian woman in her 40s, a creative director, self-possessed expression, bold statement earrings, deep-plum blazer. Warm orange rim light from the left, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, square crop with rounded corners, natural skin texture, looking slightly off camera.`

8. **Zara Ahmed · Email/CRM Marketer**（轨4 220° 粉 圆角方 88px）
   `Photorealistic head-and-shoulders portrait of a poised Middle-Eastern woman in her 30s, an email and CRM marketer, serene professional expression, silk emerald blouse. Pink rim light from the right, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, square crop with rounded corners, natural skin texture, looking straight at camera.`

9. **Lucas Meyer · Paid Media Buyer**（轨4 320° 紫 圆）
   `Photorealistic head-and-shoulders portrait of a sharp mixed white-Latino man in his 30s, a paid media buyer, decisive expression, tailored navy blazer. Violet (#A068FF) rim light from the left, deep near-black #060218 studio backdrop, soft shadows, shallow depth of field, 85mm lens, premium editorial talent-platform look, round crop, natural skin texture, looking straight at camera.`

10. **David · Account Lead**（Hero 左光标徽章 紫）
    `Photorealistic head-and-shoulders portrait of an approachable man in his 30s named David, an account lead, welcoming smile, casual blazer over a tee. Soft violet (#A068FF) rim light, deep near-black #060218 studio backdrop, soft shadows, 85mm lens, premium editorial talent-platform look, round crop, natural skin texture, looking at camera.`

### 关键色
主强调 `#A068FF`；深底 `#060218` / `#070319`；深字 `#000000`；浅字 `#ffffff`；兜底底 `#0a0a0a`。

## 权衡
- **占位即交接物 vs 直接接真图**：选占位卡 + hover 提示词，因为定位是调试样例、且真人头像有肖像授权问题、会把单文件撑成巨型二进制。占位让版式/动效先跑通，提示词随页面交付，用户按需生成——一次交付同时给了样例和生成规格。
- **自绘素材 vs 热链来源 URL**：选自绘。来源规格的图片全指向第三方 figma.site / higgs.ai，非我方资源、无授权、易失效，不能作为官网素材。
- **单文件 vs 工程化**：本期选单文件，符合「先只要一个单 html」。后续若要接真图/多页再工程化，不在本 change。

## 风险
- Google Fonts 需联网；离线打开会回退系统字体，版式基本不塌（已声明 fallback），可接受。
- 头像 hover 标注框在窄屏可能溢出视口——实现时标注框做视口内翻转/收敛，AI 验证阶段在 768/480 各核一次。
- 复刻背景为 CSS 渐变，观感与原 AI 图不会 1:1；本期以「传达氛围」为准，非像素级还原。
