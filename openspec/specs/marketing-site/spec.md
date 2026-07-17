# marketing-site 规格

## 域定位
`marketing-site` 是面向公众的官网域，与产品运行时零耦合。当前唯一生产页面是 `sites/marketeam/index.html`；目录名 `marketeam` 是历史遗留，不代表当前品牌。该域只承载官网呈现与部署事实，不依赖 runner、Electron、console-ui、SQLite、GitHub intake 或构建工程。

## 业务规则

### 唯一页面与部署
- MUST 以 `sites/marketeam/index.html` 作为当前唯一官网页面和部署入口。
- MUST 将 HTML、CSS 与 JavaScript 放在同一文件内，无 npm/pnpm 安装或构建步骤。
- 静态托管 MUST 将 `sites/marketeam/` 设为发布目录，MUST NOT 发布仓库根目录或 `docs/marketing-site/`。
- MUST 在同目录维护 `DEPLOY.md`，记录部署输入、本地预览、上线检查、缓存、回滚和外部依赖。
- MUST NOT 需要服务端进程、API、环境变量、密钥、注册或邮箱收集。
- MAY 访问 Google Fonts 与 Lucide CDN；公共资源失败时正文、主叙事和官方文档链接仍 MUST 可读可用。

### 页面目标与叙事纪律
- 页面首要目标 MUST 是把“可信的自动才稀缺”讲清楚，而不是用未经验证的质量结果推动转化。
- MUST 使用 Moebius 品牌与中文业务语言，不把内部架构、agent harness、工作流编辑器、角色配置或虚构质量数字作为主页主叙事。
- MUST 描述产品行为，MUST NOT 承诺尚无证据支持的使用结果，如“省时”“放心走开”或“可以去忙别的”。
- MUST 将过程底单表达为产品标准与设计图；MUST NOT 把概念图伪装成产品实拍或已产生的逐单证据。

### 六板块页面结构
- MUST 以一条连续问题链呈现以下六段内容：
  1. 首屏：把用户已有的 AI 变成会自己推进的团队。
  2. 旧世界：任务交出去后仍需反复确认、检查、返工和收尾。
  3. 角色移交：对齐、交接、验收与返工原来由用户承担，Moebius 接走这些推进工作，只把必须拍板的事留给用户。
  4. 三个时刻：开工前对齐、交付前逐条验收、未通过则带原因打回重做并再验。
  5. 过程底单：提出记录对齐、接手、打回、重做、拍板和验收的公开标准，并明确“示例记录、非产品实拍”。
  6. 开始行动：说明免费开源、免注册、当前为 macOS 应用，并要求本机已有可用的 Codex CLI 或 Claude CLI。
- 页头 MUST 提供“为什么 / 怎么做 / 过程底单 / 开始”页内锚点，页尾 MUST 回收产品定位。
- 下载与源码尚未开放时，相关按钮 MUST 维持禁用并如实说明状态，MUST NOT 伪造下载地址。
- CLI 安装链接 MUST 指向 Codex CLI 和 Claude CLI 的官方文档。

### 视觉与语义
- MUST 使用奶油纸背景、墨黑粗描边、零模糊硬偏移阴影与有限圆角的新野兽派视觉基线。
- 状态色语义 MUST 保持一致：蓝=对齐/推进，荧光黄绿=通过，橙=打回/返工，粉=用户/需要拍板的强调。
- 主字体 MUST 使用 Noto Sans SC（带系统中文字体回退），等宽状态文本 SHOULD 使用 JetBrains Mono。
- 插图 MUST 以页面内的 CSS 与几何/SVG 结构表达，不依赖外部写实图片。
- MUST 通过语义化 `header`、`main`、`section`、`footer` 组织页面，并提供跳到正文的 skip link。

### 动效、生命周期与降级
- 首屏 MUST 呈现接手→处理→复核→交付的任务推进，并可见一次复核未通过、返回处理、再次通过的循环。
- 旧世界在桌面端 MUST 使用粘性五拍叙事；约 760px 及以下 MUST 降级为顺序卡片，避免触屏滚动跳拍。
- 角色移交、机制和过程底单等一次性动效 MUST 在进入视口后播放并停在可读终态；循环动效只在视口内且页面可见时运行。
- 页面隐藏、pagehide 或离开视口时 MUST 暂停非必要循环动效，返回页面后 MUST 重新同步几何路径和可见性。
- MUST 尊重 `prefers-reduced-motion`；减少动态效果时六板块正文和关键图示仍 MUST 完整可读。
- MUST 在桌面与移动端保持内容可读且不产生页面级横向滚动。

### 官网资料与历史隔离
- 当前叙事规格、官网文案、用户画像、整站设计方案和动效语义参考 MUST 集中维护在 `docs/marketing-site/`。
- 已明确废弃或被取代的资料 MUST 放入 `docs/marketing-site/archive/` 并显式标记历史状态。
- archive 中的废案 MUST NOT 作为当前设计依据，MUST NOT 进入 `sites/marketeam/` 生产部署目录。

## 场景

### 场景 MS.1：唯一静态入口可直接部署
Given 静态托管把 `sites/marketeam/` 设为发布目录
When 请求 `/`
Then 返回 `index.html` 与 HTTP 200
And 不需要构建、服务端进程、环境变量或 SPA rewrite

### 场景 MS.2：六板块叙事完整
Given 访客从首页向下滚动
When 读完整页
Then 依次看到首屏、旧世界、角色移交、三个时刻、过程底单与开始行动
And 每一段承接上一段留下的问题

### 场景 MS.3：过程底单保持诚实语域
Given 访客看到过程底单
When 阅读示例记录
Then 页面明确说明完整底单仍在开发、这是标准图解而非产品实拍
And 不把尚未兑现的能力包装成真实质量证据

### 场景 MS.4：CLI 前提和发布状态如实呈现
Given 访客滚动到开始行动
When 查看使用前提和按钮
Then 页面说明需要 Mac 与可用的 Codex CLI 或 Claude CLI
And 给出版本命令和官方安装指引
And 未开放的 macOS 下载与 GitHub 源码按钮保持禁用

### 场景 MS.5：移动端不横滚
Given 视口约为 375px 宽
When 页面完成布局和动效初始化
Then 页面级 `scrollWidth` 不大于 `clientWidth`
And 六板块正文可按纵向顺序完整阅读

### 场景 MS.6：减少动态效果
Given 用户启用 `prefers-reduced-motion: reduce`
When 打开并滚动页面
Then 非必要循环和滚动动效降级
And 内容与关键状态不依赖动画才能理解

### 场景 MS.7：后台暂停循环
Given 页面正在播放循环动效
When 文档变为 hidden 或相关区块离开视口
Then 循环动效暂停
When 页面重新可见
Then 页面重新计算路径并恢复当前视口内的动效

### 场景 MS.8：历史废案不进入生产
Given 官网静态部署产物已生成
When 检查发布目录
Then 只包含 `sites/marketeam/` 的当前页面与部署说明
And `docs/marketing-site/archive/` 中的废案没有被发布
