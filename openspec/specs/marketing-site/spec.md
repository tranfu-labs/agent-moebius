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
- 首屏底部 MUST 呈现角色工牌架（见「员工工牌与工牌架」），MUST NOT 使用被动技术栈滚动条或虚构合作方 logo。

### 首屏下方正文（如实介绍项目）
- MUST 在 `sites/marketeam/index.html` 首屏之后、同一文件内以长滚动追加正文，MUST NOT 拆成多文件或引入构建。
- 正文 MUST 如实介绍本项目 agent-moebius，内容 MUST 来自真实事实源（AGENTS.md 项目概览、docs/roadmap、agents/*.md、goal-ledger 与 stages），MUST NOT 套用与项目无关的通用营销模板文案或虚构功能/数字。
- 首个交付 MUST 至少含四节主脊：项目定位、真实运行闭环、真实角色阵容、目标账本与过程保证（含收尾 CTA 与 footer）。
- 「真实运行闭环」一节 MUST 反映实际流程：扫描 issue → 归一化带 speaker 时间线 → @mention 触发本机 codex → CEO guardrail 校正后经 gh 发布 → 交棒（plan-written → code-verified）→ 目标账本到验收。
- 「角色阵容」一节 MUST 呈现真实可 @mention 角色（CEO / secretary / dev / dev-manager / product-manager / qa / hermes-user），每个角色 MUST 配与其 `agents/*.md` 职责一致的一行 charter，且角色卡 hover 弹框 MUST 展示该 charter（此处不要求复制控件）。

### 角色 charter 一致性
- 首屏圆环角色与正文「角色阵容」一节的 charter MUST 逐字一致（同一事实源 `agents/*.md`）。

### 员工工牌与工牌架
- 角色 MUST 以「员工工牌」样式呈现：卡面含卡槽/打孔、头像（缩写色卡，底色=角色光晕色）、姓名（角色名）、职位（charter）、公司标 `agent-moebius`、条形码；MUST NOT 用长挂绳等重装饰，MUST NOT 虚构 agent-moebius 之外的岗位。
- 工牌采用全息档：hover MUST 有轻 3D tilt（≤ ±6°）+ 光泽扫过 + 随指针流动的全息 foil，MUST 在 `prefers-reduced-motion` 下降级为静态。工牌样式 MUST 应用到正文「角色阵容」（完整工牌）与首屏圆环节点（简化版工牌，体量克制、不破坏轨旋转与正立）。
- 首屏底部 MUST 呈现一排**侧立斜插叠放**的角色工牌（perspective + rotateY），两端渐隐；侧立态 MUST 至少露出角色缩写色卡便于辨认。
- 工牌架 hover MUST 只做垂直位移（抬起）：MUST NOT 在 hover 时把工牌转正或放大到正面。
- 工牌架点击/激活 MUST 打开详情并**此时才显示工牌正面**：转场为标准容器变形，且 MUST 保留黑胶唱片架「拿起」的观感——但拿起 MUST 表达为运动本身而非时间分拍：被点击的工牌作为**共享元素**由**弹簧曲线**驱动（欠阻尼弹簧采样烘焙进 CSS `linear()`，仍零第三方依赖）飞抵**弹窗内工牌位**（非面板中心），MUST 快攻到位并以微过冲（~2%）一次收束咬合，MUST NOT 出现贝塞尔式渐近死尾（落定前长段低速爬行）；由侧立 ≈44° 的转正 MUST 由更快的弹簧在前半程完成；X/Y/变形面 MUST 由同一条弹簧统一驱动；全程水平速度 MUST NOT 中途归零（微过冲处的自然反向除外，所有运动分量 MUST NOT 同时刹停后重启）；途中由简化卡面交叉淡化为完整工牌，落定后与真工牌像素对齐换装；转场全程同一时刻 MUST 只存在一份该工牌的可见实例（架上原卡隐位、弹窗真工牌落定才现身），MUST NOT 双卡同屏或让被追踪的卡中途消失；弹窗呈现正面放大工牌 + 角色名、charter、`@<role>` 用法；MUST 键盘可达（focus + Enter）。
- MUST 有一块从卡片屏幕足迹连续插值到面板矩形的**变形面**承载容器连续（层序在遮罩之上、面板之下）；面板内容 MUST NOT 被非等比拉伸——内容在容器基本就位后淡入；一切内容交叉淡化 MUST 在运动进行中完成，MUST NOT 在运动停止后仍在换装；弹窗容器自身 MUST NOT 做独立的 3D 翻转入场。
- 关闭（Esc / 遮罩 / 关闭按钮均 MUST 可关）MUST 逆向变形且时长 MUST 短于打开：真工牌先无缝换回共享元素、面板内容先行淡出、变形面缩回足迹、工牌转回侧立落回架上原位，架上原卡恢复、焦点还给触发工牌；弹窗打开期间页面发生滚动后逆向变形 MUST 仍落准架上当前位置。
- 转场 MUST 用原生 Web Animations API 实现，MUST NOT 引入第三方动画库；转场进行中 MUST 防重入（重复点击/按键不叠加动画）；MUST 在 `prefers-reduced-motion`（或无 WAAPI）下降级为直接开合 + 淡入淡出，无变形无旋转。
- 打开转场 MUST ≤ 500ms、关闭 MUST ≤ 300ms 且短于打开（UI 转场时长准则）。
- 工牌架 MUST NOT 触发页面横向滚动；MUST 在 `prefers-reduced-motion` 下降级去大位移。

### 滚动进场
- 正文各段 MUST 用滚动进入视口时的一次性进场动画（原生 IntersectionObserver，无第三方动画库）。
- MUST 在 `prefers-reduced-motion` 下降级为直接显示、不做位移。
- 正文在 480/768/1024/1280 各断点 MUST 自适应且 MUST NOT 产生页面横向滚动；MUST NOT 用 `overflow:hidden` 把本应可读的内容裁掉。

## 场景

### 场景 MS.1：落地页自包含可离线打开
Given 用户双击 `sites/marketeam/index.html`
When 页面加载（无第三方站点资源可用）
Then 背景、品牌标、底部角色工牌架、角色工牌均正常渲染
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

### 场景 MS.10：角色以员工工牌呈现
Given 正文「角色阵容」或首屏圆环已渲染
When 用户查看某个角色
Then 该角色以员工工牌样式呈现（卡槽、缩写色卡、角色名、charter、agent-moebius 标、条形码）
When 用户 hover 该工牌
Then 出现 ≤±6° 的 3D 倾斜、光泽扫过与随指针流动的全息 foil
And 在 prefers-reduced-motion 下退化为静态

### 场景 MS.11：底部工牌架 hover 只抬起不转正
Given 底部角色工牌架已渲染（工牌侧立斜插）
When 用户悬停某张工牌
Then 该工牌仅垂直抬起（可含提亮），角度不变、不转正、不放大到正面
And 页面不出现横向滚动

### 场景 MS.12：点击工牌容器变形为详情弹窗
Given 底部工牌架
When 用户点击（或键盘激活）某张侧立工牌
Then 该工牌由弹簧驱动、沿带微过冲的连续轨迹快速飞抵弹窗内工牌位并咬合落定，转正在前半程完成，途中由简化卡面渐变为完整工牌
And 一块变形面从该工牌足迹连续长成面板矩形，面板文字内容在容器就位阶段淡入且不被拉伸
And 转场全程只存在一份该工牌的可见实例（架上原卡隐位）
And 落定后弹窗展示正面放大工牌、角色名、charter 与 `@<role>` 在 issue 中的用法
When 用户通过 Esc / 遮罩 / 关闭按钮关闭
Then 以短于打开的时长逆向弧线：工牌升离弹窗、临近插槽才转回侧立并落回架上当前位置，架上原卡恢复，焦点还给触发工牌

### 场景 MS.13：容器变形可降级且防重入
Given 用户开启了 prefers-reduced-motion（或浏览器无 WAAPI）
When 点击工牌打开或关闭详情弹窗
Then 弹窗直接开合（仅淡入淡出），无变形无旋转
Given 容器变形转场进行中
When 用户重复点击工牌或连按 Esc
Then 不叠加新动画、状态不错乱
