# marketing-site spec delta：marketeam-landing-page

新增业务域「营销站」。范围声明：本 delta 只规定对外营销落地页的**呈现与素材交接契约**；不涉及产品数据流、后端、构建工程化。落地页是自包含静态文件，与产品各域（console-ui / desktop-shell / github-issue-runner / goal-ledger）零耦合。

## 新增行为规则

### 载体与自包含
- MUST 把 Marketeam 落地页实现为单个自包含文件 `sites/marketeam/index.html`，HTML/CSS/JS 同文件内联，双击即可打开。
- 外链资源 MUST 只允许 Google Fonts（Inter / Urbanist）；背景、品牌标、合作方标、头像 MUST 由本文件自绘（CSS 渐变 + 内联 SVG）。
- MUST NOT 热链任何第三方站点（如 figma.site / higgs.ai）的图片或资源作为素材。
- MUST 为无网络场景声明字体 fallback，字体缺失时版式不塌。

### 版式与动效
- MUST 呈现全视口 hero：header、hero 左文案、hero 右圆环可视化、底部合作方 logo 滚动条四区。
- MUST 实现打字机标题（逐字、前 67 字深色/其余浅色、闪烁紫光标）与中心 `20k+` 数字 count-up（0→20、缓出、约 2s）。
- MUST 实现 4 条同心旋转轨（内到外 353/501/649/797px，转向与周期左30s/右40s/右50s/左60s），中心数字反向自转保持正立。
- MUST 提供四档响应式断点（1280 / 1024 / 768 / 480），1024 及以下堆叠布局、逐档缩小圆环与标题。

### 头像素材交接（本域核心）
- MUST 把 9 个 specialist 头像的第一版实现为「光晕色渐变卡 + 姓名首字母」占位；占位卡底色 MUST 取该位光晕色。
- 每个头像 MUST 携带姓名、角色、AI 生成提示词三项数据。
- MUST 在头像 hover 时弹出标注框，展示姓名·角色、AI 生成提示词全文，并提供把提示词复制到剪贴板的控件。
- 9 条提示词 MUST 出自同一模板（仅换身份与光晕色），保证生成结果成套；提示词里的 rim light 色 MUST 与该头像占位卡的光晕色一致。
- hover 标注框 MUST 在窄屏保持在视口内（内翻/收敛），MUST NOT 溢出视口不可读。

## 新增场景

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
