# 设计：onboarding-high-fidelity-prototype

## 方案

### 原型沙盒边界

新增根级 `prototypes/` private workspace，独立声明 React、Motion、Vite 与测试依赖。它不得 import 根运行时、`desktop`、`packages/*`、`src` 或其他产品实现。`prototypes/AGENTS.md` 同时禁止反向依赖，并规定高保真原型只以 PRD 为需求事实源。

### beUI 采用方式

按 beUI 的 copy-source 模式只采用需要的动效原语：按钮的 spring press、pointer ripple、reduced-motion 分支，以及共享的 easing/spring 参数。复制实现保留来源与 MIT 许可证说明，再用原型自己的 CSS 类适配，避免引入生产 Tailwind 或令牌。

### 单 HTML 构建

Vite 只负责原型 authoring；`vite-plugin-singlefile` 把 React、Motion、CSS 与 SVG 全部内联。构建先写精确的临时输出 `prototypes/dist/index.html`，发布脚本验证不存在外部脚本、样式、图片或字体引用后，再原子覆盖 `docs/product/pages/onboarding.prototype.html`。不得把输出目录直接设为 `docs/product/pages`，避免构建清理误删产品文档。

### 交互模型

用纯状态函数描述环境门、四步推进、团队选择、接力重播与最终新建对话状态。动画只是状态的视觉投影，不决定能否继续；第 3 步 CTA 始终可用。场景面板只服务评审，默认收起，不进入产品界面信息层级。

### 页面结构

字符图见 `wireframes.md`。正式结构以 `docs/product/pages/onboarding.md#页面结构` 为产品基线。

## 权衡

- 选择独立 workspace 而不是复用 `packages/console-ui`：牺牲直接复用生产组件，换取设计探索与开发代码的双向隔离。
- 选择 React + Motion 构建后单文件，而不是手写原生 HTML：多一个显式构建步骤，但可以真实采用 beUI 动效实现，避免只做外观模仿。
- 选择提交生成 HTML：会产生较大的 diff，但评审者无需安装依赖或启动服务即可打开完整原型。
- 首版只做 onboarding 入口，不先抽象多页面原型平台；第二份原型出现后再提取多入口构建能力。

## 风险

- 单文件插件升级可能重新生成外部 asset。发布脚本和 Playwright 都扫描网络请求与资源 URL，发现外部依赖即失败。
- 动画定时器可能让交互测试不稳定。测试以可见状态和显式 replay key 为准，关键场景提供减少动态效果路径。
- 原型与正式实现可能视觉漂移。PRD 是唯一产品事实源；原型明确标注为设计交付物，正式实现不复用其源码。
- 生成文件体积可能膨胀。首版只复制必要 beUI 原语，不引入完整组件集合或外部字体。
