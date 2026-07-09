# marketing-site 规格

## 域定位
`marketing-site` 是面向公众的营销站点域，承载与产品运行时零耦合的自包含静态落地页。首个交付物是 Marketeam 营销人才平台落地页 `sites/marketeam/index.html`。本域只规定落地页的**呈现与素材交接契约**，不承载产品数据流、后端、IPC、runner/observer 或构建工程化；它与 `console-ui` / `desktop-shell` / `github-issue-runner` / `goal-ledger` 各域互不依赖。

## 业务规则

### 载体与自包含
- MUST 把 Marketeam 落地页实现为单个自包含文件 `sites/marketeam/index.html`，HTML/CSS/JS 同文件内联，双击即可打开。
- 外链资源 MUST 只允许 Google Fonts（Inter / Urbanist）；背景、品牌标、合作方标、头像 MUST 由本文件自绘（CSS 渐变 + 内联 SVG）。
- MUST NOT 热链任何第三方站点（如 figma.site / higgs.ai）的图片或资源作为素材。
- MUST 为无网络场景声明字体 fallback，字体缺失时版式不塌。

### 版式与动效
- MUST 呈现全视口 hero：header、hero 左文案、hero 右圆环可视化、底部合作方 logo 滚动条四区。
- MUST 实现打字机标题（逐字、前 67 字深色/其余浅色、闪烁紫光标）与中心 `20k+` 数字 count-up（0→20、缓出、约 2s）。
- MUST 实现 4 条同心旋转轨（内到外 353/501/649/797px，转向与周期左 30s/右 40s/右 50s/左 60s），中心数字反向自转保持正立。
- MUST 提供四档响应式断点（1280 / 1024 / 768 / 480），1024 及以下堆叠布局、逐档缩小圆环与标题，且 MUST NOT 产生页面横向滚动。

### 头像素材交接（本域核心）
- MUST 把 9 个 specialist 头像的第一版实现为「光晕色渐变卡 + 姓名首字母」占位；占位卡底色 MUST 取该位光晕色。
- 每个头像 MUST 携带姓名、角色、AI 生成提示词三项数据。
- MUST 在头像 hover 时弹出标注框，展示姓名·角色、AI 生成提示词全文，并提供把提示词复制到剪贴板的控件。
- 9 条提示词 MUST 出自同一模板（仅换身份与光晕色），保证生成结果成套；提示词里的 rim light 色 MUST 与该头像占位卡的光晕色一致。
- hover 标注框 MUST 在窄屏保持在视口内（内翻/收敛），MUST NOT 溢出视口不可读。

### 首屏下方正文（如实介绍项目）
- MUST 在 `sites/marketeam/index.html` 首屏之后、同一文件内以长滚动追加正文，MUST NOT 拆成多文件或引入构建。
- 正文 MUST 如实介绍本项目 agent-moebius，内容 MUST 来自真实事实源（AGENTS.md 项目概览、docs/roadmap、agents/*.md、goal-ledger 与 stages），MUST NOT 套用与项目无关的通用营销模板文案或虚构功能/数字。
- 首个交付 MUST 至少含四节主脊：项目定位、真实运行闭环、真实角色阵容、目标账本与过程保证（含收尾 CTA 与 footer）。
- 「真实运行闭环」一节 MUST 反映实际流程：扫描 issue → 归一化带 speaker 时间线 → @mention 触发本机 codex → CEO guardrail 校正后经 gh 发布 → 交棒（plan-written → code-verified）→ 目标账本到验收。
- 「角色阵容」一节 MUST 呈现真实可 @mention 角色（CEO / secretary / dev / dev-manager / product-manager / qa / hermes-user），每个角色 MUST 配与其 `agents/*.md` 职责一致的一行 charter，且角色卡 hover 弹框 MUST 展示该 charter（此处不要求复制控件）。

### 滚动进场
- 正文各段 MUST 用滚动进入视口时的一次性进场动画（原生 IntersectionObserver，无第三方动画库）。
- MUST 在 `prefers-reduced-motion` 下降级为直接显示、不做位移。
- 正文在 480/768/1024/1280 各断点 MUST 自适应且 MUST NOT 产生页面横向滚动；MUST NOT 用 `overflow:hidden` 把本应可读的内容裁掉。

## 场景

### 场景 MS.1：落地页自包含可离线打开
Given 用户双击 `sites/marketeam/index.html`
When 页面加载（无第三方站点资源可用）
Then 背景、品牌标、合作方标、头像占位均正常渲染
And 仅字体可能回退到系统字体，版式不塌

### 场景 MS.2：头像 hover 交出生成提示词
Given 落地页已加载、9 头像占位已入场
When 用户把指针悬停到某个头像
Then 弹出标注框显示该 specialist 的姓名·角色
And 显示该头像的 AI 生成提示词全文
And 提供把提示词复制到剪贴板的控件

### 场景 MS.3：占位色与提示词呼应
Given 某头像占位卡底色为紫（`#A068FF`）
When 查看其 hover 标注框内的提示词
Then 提示词内的 rim light 色为同一紫色

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
Given 正文「角色阵容」一节已渲染
When 用户 hover 某个角色卡（如 qa）
Then 弹框显示该角色真实 charter（qa：方案阶段对抗性审查，对照 invariants oracle）
And charter 与其 `agents/*.md` 职责一致
And 弹框不含复制控件

### 场景 MS.7：滚动进场且可降级
Given 用户向下滚动
When 某节进入视口
Then 该节以一次性进场动画淡入
And 在 prefers-reduced-motion 下改为直接显示、无位移
