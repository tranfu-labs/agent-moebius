# marketing-site 规格

## 域定位
`marketing-site` 是面向公众的营销站点域，承载与产品运行时零耦合的自包含静态落地页。首个交付物是落地页 `sites/marketeam/index.html`（首屏与正文均如实呈现本项目 agent-moebius；目录名 `marketeam` 为早期样例遗留的历史包袱，暂不改名以免牵动引用）。本域只规定落地页的**呈现契约**，不承载产品数据流、后端、IPC、runner/observer 或构建工程化；它与 `console-ui` / `desktop-shell` / `github-issue-runner` / `goal-ledger` 各域互不依赖。

## 业务规则

### 载体与自包含
- MUST 把落地页实现为单个自包含文件 `sites/marketeam/index.html`，HTML/CSS/JS 同文件内联，双击即可打开。
- 外链资源 MUST 只允许 Google Fonts（Inter / Urbanist）；背景、品牌标、底部条、角色卡 MUST 由本文件自绘（CSS 渐变 + 内联 SVG）。
- MUST NOT 热链任何第三方站点（如 figma.site / higgs.ai）的图片或资源作为素材。
- MUST 为无网络场景声明字体 fallback，字体缺失时版式不塌。

### 版式与动效
- MUST 呈现全视口 hero：header、hero 左文案、hero 右圆环可视化、底部技术栈滚动条四区。
- MUST 实现打字机标题（逐字、首句深色/次句浅色、闪烁紫光标）。
- MUST 实现 4 条同心旋转轨（内到外 353/501/649/797px，转向与周期左 30s/右 40s/右 50s/左 60s），中心块与角色节点反向自转保持正立。
- MUST 提供四档响应式断点（1280 / 1024 / 768 / 480），1024 及以下堆叠布局、逐档缩小圆环与标题，且 MUST NOT 产生页面横向滚动。

### 首屏品牌与角色（agent-moebius）
- 首屏 MUST 呈现 agent-moebius 品牌：logo、导航（Overview / How it works / Docs / GitHub）、右侧入口（GitHub / Get started）；MUST NOT 保留 Marketeam 营销人才平台文案。
- 打字机主标题 MUST 为如实反映产品交互的语句（当前：`@mention a role. Your AI team ships it.`）。
- MUST NOT 在首屏出现对 agent-moebius 不成立的数字/战绩（如「20k+ Specialists」等虚构规模）。
- 首屏圆环中心 MUST 呈现编排者角色 CEO（体现「orchestrates & guards」）；其余真实角色（secretary / dev / dev-manager / product-manager / qa / hermes-user）MUST 作为绕轨节点呈现。
- 每个角色 MUST 配与其 `agents/*.md` 职责一致的一行 charter；角色节点 hover MUST 弹框显示该 charter（复用同一 tooltip 组件，此处不要求复制控件）。
- 底部滚动条 MUST 呈现真实技术栈（如 Node.js · TypeScript · Codex · gh · Electron），MUST NOT 使用虚构合作方 logo 冒充「被信任墙」。

### 首屏下方正文（如实介绍项目）
- MUST 在 `sites/marketeam/index.html` 首屏之后、同一文件内以长滚动追加正文，MUST NOT 拆成多文件或引入构建。
- 正文 MUST 如实介绍本项目 agent-moebius，内容 MUST 来自真实事实源（AGENTS.md 项目概览、docs/roadmap、agents/*.md、goal-ledger 与 stages），MUST NOT 套用与项目无关的通用营销模板文案或虚构功能/数字。
- 首个交付 MUST 至少含四节主脊：项目定位、真实运行闭环、真实角色阵容、目标账本与过程保证（含收尾 CTA 与 footer）。
- 「真实运行闭环」一节 MUST 反映实际流程：扫描 issue → 归一化带 speaker 时间线 → @mention 触发本机 codex → CEO guardrail 校正后经 gh 发布 → 交棒（plan-written → code-verified）→ 目标账本到验收。
- 「角色阵容」一节 MUST 呈现真实可 @mention 角色（CEO / secretary / dev / dev-manager / product-manager / qa / hermes-user），每个角色 MUST 配与其 `agents/*.md` 职责一致的一行 charter，且角色卡 hover 弹框 MUST 展示该 charter（此处不要求复制控件）。

### 角色 charter 一致性
- 首屏圆环角色与正文「角色阵容」一节的 charter MUST 逐字一致（同一事实源 `agents/*.md`）。

### 滚动进场
- 正文各段 MUST 用滚动进入视口时的一次性进场动画（原生 IntersectionObserver，无第三方动画库）。
- MUST 在 `prefers-reduced-motion` 下降级为直接显示、不做位移。
- 正文在 480/768/1024/1280 各断点 MUST 自适应且 MUST NOT 产生页面横向滚动；MUST NOT 用 `overflow:hidden` 把本应可读的内容裁掉。

## 场景

### 场景 MS.1：落地页自包含可离线打开
Given 用户双击 `sites/marketeam/index.html`
When 页面加载（无第三方站点资源可用）
Then 背景、品牌标、底部技术栈条、角色卡均正常渲染
And 仅字体可能回退到系统字体，版式不塌

### 场景 MS.4：窄屏不横滚
Given 视口宽度落入 480 / 768 / 1024 任一断点
When 页面渲染完成
Then 标题按档缩小、圆环按档缩放、布局在 1024 及以下堆叠
And 页面 MUST NOT 出现横向滚动条

### 场景 MS.5：正文如实介绍 agent-moebius
Given 用户滚动到首屏下方正文
When 阅读各节
Then 呈现的是 agent-moebius 的真实定位、运行闭环、角色与目标账本
And 不出现与项目无关的虚构营销漏斗文案

### 场景 MS.6：角色 charter 忠于事实源
Given 「角色阵容」一节或首屏圆环已渲染
When 用户 hover 某个角色（如 qa）
Then 弹框显示该角色真实 charter（qa：方案阶段对抗性审查，对照 invariants oracle）
And charter 与其 `agents/*.md` 职责一致
And 弹框不含复制控件

### 场景 MS.7：滚动进场且可降级
Given 用户向下滚动
When 某节进入视口
Then 该节以一次性进场动画淡入
And 在 prefers-reduced-motion 下改为直接显示、无位移

### 场景 MS.8：首屏如实呈现 agent-moebius
Given 用户打开落地页首屏
When 页面加载
Then 品牌、导航、主标题、圆环、底部条均围绕 agent-moebius
And 不出现 Marketeam 营销文案或对本项目不成立的虚构数字

### 场景 MS.9：首屏圆环即角色团队
Given 首屏圆环已渲染
When 用户观察圆环
Then 中心为 CEO（orchestrates & guards）
And 其余真实角色绕轨呈现
When 用户 hover 某个绕轨角色
Then 弹框显示该角色真实 charter（与正文一致），且不含复制控件
