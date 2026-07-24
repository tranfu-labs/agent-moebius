# 设计：adopt-moebius-icon-macos-arm64

## 方案

### 1. 单一母版与确定性派生

把用户提供的原图原样保存为 `assets/brand/moebius.png`。母版保持 1254×1254 RGB PNG、黑色莫比乌斯环、白色方形底和原有留白，不做生成式重绘、抠图、裁切或预烘焙圆角。

新增 `scripts/generate-brand-assets.mjs`：

- 默认模式只在 macOS 调用系统 `sips` 按宽高等比缩放到固定正方形尺寸，不修改构图。
- `--check` 模式使用 Node.js 读取品牌 manifest、校验源与产物 SHA-256、PNG 签名、IHDR 宽高和字节上限，不依赖 `sips`，因此普通测试与发布门禁都能只读执行。
- 生成完成后写 `assets/brand/manifest.json`，记录源哈希、每个产物的用途、尺寸、字节上限与结果哈希。
- 同尺寸副本必须拥有相同内容哈希；官网目录保留部署所需的本地副本，避免发布目录引用仓库外路径。

| 用途 | 目标 | 尺寸 | 文件大小上限 |
| --- | --- | --- | --- |
| Electron 应用图标源 | `assets/brand/generated/app-icon-1024.png` | 1024×1024 | 1 MiB |
| 应用内共享 Logo | `assets/brand/generated/ui-icon-64.png` | 64×64 | 32 KiB |
| renderer / 官网 favicon | `assets/brand/generated/favicon-32.png` | 32×32 | 16 KiB |
| Apple Touch Icon | `assets/brand/generated/apple-touch-icon-180.png` | 180×180 | 128 KiB |
| 官网部署副本 | `sites/marketeam/assets/` 下对应文件 | 同源尺寸 | 与上表一致 |

Electron-builder 直接消费 1024px PNG 并在打包时生成 `.icns`；仓库不额外提交一份可能与 PNG 漂移的手工 ICNS。

### 2. 正式入口复用

- `packages/console-ui` 新增共享 `MoebiusLogo`，导入 64px 产物并由 Vite 内联到库产物；主侧栏和 onboarding 只复用该组件，不再各自维护 SVG 或 Lucide Infinity 图标。
- `desktop/scripts/build.mjs` 把 64px 与 32px 产物复制到 console/status renderer 输出目录；两个 HTML head 引用 favicon，状态页标题区显示同源 Logo。
- Electron 主窗口仍沿用系统应用图标；打包态由 Electron-builder 的 mac icon 配置把 1024px 产物写入 `.app` 与 DMG。
- 官网正式 `index.html` 引用 `sites/marketeam/assets/` 内的 32px favicon、180px Apple Touch Icon和 64px页头图标，实验 HTML 不批量修改。

### 3. macOS arm64 唯一发布链

- `desktop/package.json` 只保留 mac 配置，目标为 arm64 `dmg` 与 `zip`，产物名包含 `mac-arm64`。
- `dist` 脚本先执行品牌资产 `--check`，再显式调用 `electron-builder --mac --arm64`；命令行和配置形成双重限制。
- Release workflow 去掉操作系统矩阵，只使用当前原生 arm64 的 `macos-latest` runner，并在构建前断言 `RUNNER_ARCH=ARM64`。
- 运行时已有 Windows/Linux 分支保留，但 OpenSpec 不再把它们列为产品场景；更新策略的正式契约只保留 macOS 下载页路径。

### 4. 官网与文档

- 官网页头、首屏、开始行动和页脚统一写明 `macOS · Apple Silicon`，继续保持下载尚未开放的 disabled 状态。
- `DEPLOY.md` 把品牌静态资产纳入发布与 404 检查，不再声称目录只有两个文本文件。
- `docs/adr/0003-sqlite-driver-and-worker-lifecycle.md` 仍处于 proposed；只修正其中已失效的“三平台打包”背景与后果描述，不改变继续使用 `node:sqlite` 的数据库决策。
- 根 `AGENTS.md`、桌面常用命令和发布说明在实现完成后同步为单平台口径。

## 权衡

- 选择保留原图白底和留白，而不是抠出透明符号或重做 macOS Liquid Glass 分层图标：这样忠实执行用户指定素材，且 Apple 系统会对方形图标应用平台遮罩；代价是暂不提供深色、透明或分层变体。
- 选择提交派生产物并用脚本校验，而不是每次 build 都现场生成：普通源码 build 不会因为缺少 macOS 图像工具而失败，发布仍能检查资产没有漂移；代价是仓库包含少量可再生成的二进制文件。
- 选择 Electron-builder 从 PNG 生成 ICNS，而不是提交手工 ICNS：减少双源与维护成本；代价是最终 ICNS 只在打包产物中出现。
- 选择保留跨平台防御代码而只收窄发行链：降低本次变更风险；代价是源码里仍能看到非正式支持平台的条件分支。

## 风险

- 64px 图标若压缩后超过 Vite 内联预算，桌面包可能留下外部资源路径；通过文件大小门禁和构建产物断言防止。
- GitHub runner 标签未来可能改变架构；workflow 运行时校验 `RUNNER_ARCH`，不符合时在打包前失败。
- Electron-builder 配置虽写 arm64，命令行参数仍可能被人工覆盖；发布测试同时检查配置、workflow 与实际 Mach-O 架构。
- 官网新增外部静态文件后缓存策略不同于单 HTML；使用稳定文件名、随 HTML 同步部署，并在上线清单中检查 200 与 content-type。
- 原图在 32px 下可能细节变软；实现阶段必须肉眼检查所有尺寸。若不可辨识，只允许调整缩放算法或文件压缩，不改变构图，任何裁切或重绘需重新确认。

## 回滚

删除新品牌引用并恢复旧 SVG/Infinity 图标、恢复 Electron-builder 三平台配置与 workflow 矩阵即可回滚；母版和派生产物可留在仓库但不被消费。产品 PRD 与规格回滚必须与代码同步，不能只恢复 CI。
