# 提案：marketeam-landing-page

## 背景
项目需要一个对外营销落地页 Marketeam（营销人才平台）。当前仓库没有任何面向公众的营销站点，也没有承载它的目录与事实源域。此页定位是**可调试的样例**：先出一个自包含的单 HTML，把版式、动效、响应式全部跑通，图片素材先用占位实现，真人头像图由用户后续自行生成替换。

## 提案
在 `sites/marketeam/index.html` 新增一个**自包含单 HTML 落地页**（原生 HTML/CSS/JS，把来源规格里的 React + Vite 翻译成纯浏览器实现）。

- 外链只保留 Google Fonts（Inter / Urbanist）；背景、品牌标、合作方标、头像**全部自绘**（CSS 渐变 + 内联 SVG），不热链任何第三方站点资源。
- 版式与动效完全对齐来源规格：header、打字机标题、Start Project 按钮、David 光标徽章、4 条同心旋转轨 + 20k+ count-up + 9 个头像、底部合作方 logo 无限滚动条、入场动画、四档响应式断点。
- **头像素材以「占位即交接物」实现**：9 个头像第一版用「光晕色渐变卡 + 姓名首字母」占位；每个头像 hover 弹出标注框，内含该头像的 AI 生成提示词与复制按钮。用户据此自行生成真人头像后替换。

## 影响
- 新增目录 `sites/`（独立静态站点区，与 `packages/` `desktop/` 等产品工作区隔离）。
- 新增事实源业务域 `marketing-site`（营销站），记录该落地页的呈现契约与头像提示词交接机制。
- 新增版式事实源页 `docs/wireframes/pages/marketeam-landing.md`（归档时回流）。
- 不触碰任何现有产品代码、spec 域（console-ui / desktop-shell / github-issue-runner / goal-ledger）与构建链路；纯静态文件，无新依赖。
