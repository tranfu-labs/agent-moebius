# 提案：marketeam-landing-sections

## 背景
落地页 `sites/marketeam/index.html` 目前只有首屏（借用的 Marketeam 营销壳）。首屏之下需要一条正文叙事，**如实介绍本项目 moebius**（而非虚构的营销人才平台）。内容 MUST 来自真实事实源（AGENTS.md 项目概览、docs/roadmap、agents/*.md、goal-ledger.ts），NEVER 套用通用 SaaS 漏斗模板。定位仍是调试样例，文案够意思即可。

## 提案
在同一个 `sites/marketeam/index.html` 里、首屏下方追加**一条长滚动正文（先搭主脊 4 节）**，如实介绍 moebius：

1. **是什么**：一句话定位 + 三个概念芯片（本机运行 codex/gh · GitHub issue 驱动 · 一支 AI 角色团队 + CEO 把关）。
2. **怎么跑**：真实运行闭环（扫描 issue → 归一化时间线 → @mention 触发本机 codex → CEO guardrail 校正 → 交棒 plan-written→code-verified → 目标账本到验收回流）。
3. **你的 AI 团队**：7 个真实角色（CEO / secretary / dev / dev-manager / product-manager / qa / hermes-user）+ 真实一行职责；复用首屏头像卡视觉与 hover，但 hover 出的是「角色真实 charter」。
4. **目标账本 + 过程保证 + 收尾**：goal→milestone→task→phase、先方案后代码、验收回流全程可追踪；末尾 CTA（复用 Start Project 按钮）+ footer。

**新增唯一机制**：滚动进场（IntersectionObserver，原生零库）——首屏一次性入场动画在长页上的延伸。

## 影响
- 只改 `sites/marketeam/index.html`（追加 4 个 `<section>` + 滚动进场脚本 + 段落样式）。**本期不动首屏**（Marketeam 壳保留；换 hero 品牌是后续可选项）。
- 扩展 `marketing-site` 域 spec：新增「首屏下方正文」呈现契约。
- 回流版式事实源 `docs/wireframes/pages/marketeam-landing.md` 与 `flow.md`。
- 复用既有设计系统（药丸按钮+旋转描边、紫 mesh/光晕、hairline 卡、count-up、头像卡+hover），不新造视觉语言、不引第三方图片、不加构建依赖。

## 存在的已知取舍
- 首屏是 Marketeam 营销壳、正文讲 moebius，**存在品牌错位**；本期作为调试样例接受此错位，先不动首屏。
- 正文文案用英文（与首屏同语言），但内容忠于中文事实源。
