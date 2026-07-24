# 提案：adopt-moebius-icon-macos-arm64

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/prd.md` | `#品牌与发行平台` | 新增统一品牌母版与仅发行 macOS Apple Silicon 的产品决策 | 已写入 |
| `docs/product/pages/main-left-sidebar.md` | `#品牌标题栏与关闭按钮` | 明确侧边栏 Logo 必须来自全局品牌母版 | 已写入 |
| `docs/product/pages/onboarding.md` | `#应用标题栏每屏` | 明确四步引导共用同源品牌图标 | 已写入 |

## 背景

当前桌面打包没有显式产品图标，主侧栏与 onboarding 分别使用两套不同的无限符号，辅助诊断页和官网也没有统一 favicon。桌面发行工作流同时构建 macOS、Windows 与 Linux，产品事实源却只把产品笼统描述为本地桌面 App，没有明确 Apple Silicon 是唯一正式发行平台。

用户已经提供 1254×1254 PNG 品牌母版，并确认正式入口全部采用该图标；图像允许通过脚本派生适配各场景的尺寸和文件大小。用户同时确认只发布 macOS Apple Silicon，不再提供 Windows、Linux、Intel Mac 或 universal 产物，但保留运行时代码中的跨平台防御分支。

## 提案

- 把用户提供的 PNG 保存为仓库内唯一品牌母版，建立可重复生成与校验的图像资产脚本。
- 从母版派生 Electron 应用图标、应用内 UI 图标、favicon、官网品牌图标和 Apple Touch Icon，并为像素尺寸、格式、文件大小与哈希建立门禁。
- 让主侧栏、onboarding、辅助诊断页、桌面 renderer head 和官网正式入口使用同源图标。
- 将 Electron 打包和 GitHub Release workflow 收敛为原生 macOS arm64 的 DMG + ZIP，并在公开文案和产物名中明确 Apple Silicon。
- 保留非 macOS 运行时分支作为源码级防御，不再把它们列为产品支持或发布目标。

## 影响

- 品牌资产：`assets/brand/`、资产生成/检查脚本。
- 桌面打包：`desktop/package.json`、`desktop/scripts/build.mjs`、桌面 HTML 与诊断页。
- UI：`packages/console-ui` 的共享品牌组件、主侧栏与 onboarding。
- 官网：`sites/marketeam/index.html`、同目录品牌资产与 `DEPLOY.md`。
- 发布：`.github/workflows/release-desktop.yml`。
- 文档一致性：根 `AGENTS.md` 与仍处于 proposed 的 ADR-0003。
- 事实源：`desktop-shell`、`console-ui`、`marketing-site` 三个规格域与相关产品 PRD。
