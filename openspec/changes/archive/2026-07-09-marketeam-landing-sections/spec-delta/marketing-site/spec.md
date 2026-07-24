# marketing-site spec delta：marketeam-landing-sections

在既有 `marketing-site` 域基础上，新增「Marketeam 落地页首屏下方正文」的呈现契约。本 delta 只新增，不改动首屏（hero）既有规则。

## 新增行为规则

### 首屏下方正文
- MUST 在 `sites/marketeam/index.html` 首屏之后、同一文件内以长滚动追加正文，MUST NOT 拆成多文件或引入构建。
- 正文 MUST 如实介绍本项目 moebius，内容 MUST 来自真实事实源（AGENTS.md 项目概览、docs/roadmap、agents/*.md、goal-ledger 与 stages），MUST NOT 套用与项目无关的通用营销模板文案或虚构功能/数字。
- 首个交付 MUST 至少含四节主脊：项目定位、真实运行闭环、真实角色阵容、目标账本与过程保证（含收尾 CTA 与 footer）。
- 「真实运行闭环」一节 MUST 反映实际流程：扫描 issue → 归一化带 speaker 时间线 → @mention 触发本机 codex → CEO guardrail 校正后经 gh 发布 → 交棒（plan-written → code-verified）→ 目标账本到验收。
- 「角色阵容」一节 MUST 呈现真实可 @mention 角色（CEO / secretary / dev / dev-manager / product-manager / qa / hermes-user），每个角色 MUST 配与其 `agents/*.md` 职责一致的一行 charter。

### 滚动进场
- 正文各段 MUST 用滚动进入视口时的一次性进场动画（原生 IntersectionObserver，无第三方动画库）。
- MUST 在 `prefers-reduced-motion` 下降级为直接显示、不做位移。

### 复用与约束
- MUST 复用既有设计系统（药丸+旋转描边按钮、紫强调、hairline 卡、头像卡 + hover 弹框），MUST NOT 新造平行视觉语言或引入第三方图片外链。
- 角色卡 hover 弹框 MUST 展示该角色真实 charter（此处不要求复制控件）。
- 正文在 480/768/1024/1280 各断点 MUST 自适应且 MUST NOT 产生页面横向滚动。

## 新增场景

### 场景 MS.5：正文如实介绍 moebius
Given 用户滚动到首屏下方正文
When 阅读各节
Then 呈现的是 moebius 的真实定位、运行闭环、角色与目标账本
And 不出现与项目无关的虚构营销漏斗文案

### 场景 MS.6：角色 charter 忠于事实源
Given 正文「角色阵容」一节已渲染
When 用户 hover 某个角色卡（如 qa）
Then 弹框显示该角色真实 charter（qa：方案阶段对抗性审查，对照 invariants oracle）
And charter 与其 `agents/*.md` 职责一致

### 场景 MS.7：滚动进场且可降级
Given 用户向下滚动
When 某节进入视口
Then 该节以一次性进场动画淡入
And 在 prefers-reduced-motion 下改为直接显示、无位移
