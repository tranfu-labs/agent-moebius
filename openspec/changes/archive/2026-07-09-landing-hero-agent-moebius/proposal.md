# 提案：landing-hero-agent-moebius

## 背景
落地页 `sites/marketeam/index.html` 首屏仍是借来的 Marketeam 营销人才平台壳，而首屏下方正文已如实介绍 agent-moebius，全页**品牌错位**。本 change 把首屏也换成 agent-moebius，让整页一致。

## 提案
改造首屏内容（机制不变，只换内容），使其如实呈现 agent-moebius：

- **品牌**：Logo `Marketeam` → `agent-moebius`；nav `Your Team/Solutions/Blog/Pricing` → `Overview / How it works / Docs / GitHub`（前两项锚到正文①②）；右侧 `Log In/Join Now` → `GitHub / Get started`。
- **主标题**（打字机）：`@mention a role. Your AI team ships it.`
- **按钮/徽章**：`Start Project` → `Get started →`；`David` 光标徽章 → `@ceo` mention 芯片（示意「@角色」交互）。
- **圆环**：中心 `20k+ Specialists`（对 agent-moebius 是假数字）→ **CEO 居中（orchestrates & guards）+ 6 个真实角色绕轨**（secretary / dev / dev-manager / product-manager / qa / hermes-user）；hover 角色出真实 charter（与正文③一致）。移除中心 count-up。
- **底部 ticker**：虚构合作方 logo → **真实技术栈条** `Node.js · TypeScript · Codex · gh · Electron`。
- **保留**：背景 mesh、打字机、四轨旋转、入场动画、响应式断点、hover 弹框组件、旋转描边按钮。

## 影响
- 只改 `sites/marketeam/index.html` 首屏区（正文 4 节不动）。
- 修改 `marketing-site` 域 spec：**退役首屏的「9 persona 占位 + AI 照片生成提示词 + 复制」交接机制（第 1 轮 MS 核心 / MS.2 / MS.3）**，代之以「首屏角色绕轨 + charter hover」；中心 count-up 规则移除。
- 回流 `docs/wireframes/pages/marketeam-landing.md` 与 `flow.md`。
- 目录名 `sites/marketeam/` 保持不变（避免连带改动引用），仅内容改为 agent-moebius。

## 已知取舍
- **退役照片提示词交接**：第 1 轮「占位即交接物」是为营销真人头像服务的；首屏改为 AI 角色后该机制天然不适用，人像提示词保留在归档 round-1 design.md 与 git 历史。若后续要在别处保留「hover 出生成提示词」的交接玩法，另开 change。
- **目录名与品牌不符**：`sites/marketeam/` 目录名仍带 marketeam；本期不改名以免牵动引用，属可接受的历史包袱，后续可单独重命名。
