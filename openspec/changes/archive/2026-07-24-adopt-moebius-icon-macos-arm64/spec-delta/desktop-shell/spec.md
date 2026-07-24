# desktop-shell spec delta

## Requirement: 品牌母版可重复派生并校验

Source: docs/product/prd.md#品牌与发行平台

系统 MUST 把 `assets/brand/moebius.png` 作为唯一品牌母版，通过仓库脚本派生 1024px 应用图标、64px UI 图标、32px favicon 与 180px Apple Touch Icon，并在只读检查中校验源/产物哈希、PNG 格式、正方形尺寸和文件大小上限。系统 MUST NOT 通过手工维护多份互不校验的图标或在派生时裁切、抠图、重绘、改变白底与原有留白。

### Scenario: 已提交产物与母版一致

- GIVEN 品牌母版和 manifest 已提交
- WHEN 运行资产脚本的 `--check` 模式
- THEN 每个声明产物的 SHA-256、PNG 尺寸和文件大小都通过
- AND 同尺寸部署副本具有相同内容哈希

### Scenario: 产物被手工替换

- GIVEN 64px UI 图标被替换为另一张同尺寸 PNG
- WHEN 运行资产脚本的 `--check` 模式
- THEN 检查因哈希不匹配失败
- AND desktop 打包不得继续

## Requirement: 桌面安装包使用统一 Moebius 图标

Source: docs/product/prd.md#品牌与发行平台

Electron 打包 MUST 使用品牌脚本生成的 1024px PNG 作为 `.app` 和 DMG 的应用图标来源，并让 Electron-builder 在打包时生成系统所需的 ICNS 尺寸。辅助诊断页和 desktop renderer head MUST 使用同源 64px/32px 产物。系统 MUST NOT 回退到 Electron 默认图标或与应用内品牌位置不同的图形。

### Scenario: 检查打包后的应用

- GIVEN macOS arm64 打包已完成
- WHEN 检查 `.app` bundle 与挂载后的 DMG
- THEN 应用和磁盘映像显示 Moebius 品牌图标
- AND bundle 内存在由 1024px 母版派生的系统图标资源

## Requirement: 正式发行仅生成 macOS Apple Silicon 产物

Source: docs/product/prd.md#品牌与发行平台

桌面打包配置与发布命令 MUST 只生成 macOS arm64 的 DMG 和 ZIP，产物名 MUST 明确包含 `mac-arm64`。Release workflow MUST 只在原生 arm64 macOS runner 上执行，并在打包前校验 runner 架构。正式发布 MUST NOT 生成 Windows、Linux、macOS x64 或 universal 产物。

### Scenario: desktop tag 触发发布

- GIVEN `desktop-v*` tag 触发 Release workflow
- WHEN runner 通过架构检查并完成 Electron-builder
- THEN Release 只收到同版本的 macOS arm64 DMG 与 ZIP
- AND 没有 exe、AppImage、x64、universal 或其他平台产物

### Scenario: runner 不是 arm64

- GIVEN Release job 被调度到非 arm64 runner
- WHEN workflow 执行架构门禁
- THEN job 在安装包构建前失败
- AND 不发布交叉编译或架构不明的产物

## Requirement: 正式更新策略只覆盖 macOS

Source: docs/product/prd.md#品牌与发行平台

正式产品 MUST 只承诺 macOS 的“检查更新 → 有新版则跳转下载页”路径。Windows/Linux 更新分支 MAY 作为源码级防御保留，但 MUST NOT 出现在产品支持规格、发布 workflow、官网文案或验收矩阵中。

### Scenario: macOS 用户检查更新

- GIVEN 用户运行正式 macOS Apple Silicon 版本
- WHEN 检查到更新
- THEN 应用跳转到包含 Apple Silicon 产物的下载页
- AND 不向用户展示其他操作系统或 CPU 架构的下载选项
