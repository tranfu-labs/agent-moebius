# 任务：adopt-moebius-icon-macos-arm64

- [x] 把统一品牌与 macOS Apple Silicon 唯一发行平台写入总 PRD、主侧栏 PRD 和 onboarding PRD。
- [x] 导入品牌母版，新增资产生成/检查脚本、manifest 和尺寸/文件大小单元测试。
- [x] 新增 `MoebiusLogo` 共享组件并接入主侧栏、onboarding、desktop renderer favicon 与辅助诊断页。
- [x] 为 Electron-builder 配置 1024px 应用图标，并把桌面 dist 收敛为 arm64 DMG + ZIP。
- [x] 将 Release workflow 收敛为单一原生 arm64 macOS job并增加架构门禁。
- [x] 更新官网正式入口的品牌图标、favicon、Apple Touch Icon、Apple Silicon 文案和部署检查。
- [x] 同步根 `AGENTS.md`、proposed ADR-0003 和桌面发布说明中的平台口径。
- [x] 补齐配置、组件和官网测试，运行 typecheck、测试、桌面 build 与实际 arm64 打包验证。
- [x] 肉眼检查 1024/180/64/32px 图标，以及官网桌面/375px 和桌面主界面/onboarding 的品牌呈现。

## 验证记录

- `pnpm brand:check`：7 个派生产物全部通过哈希、PNG、尺寸与文件大小门禁。
- 品牌/发行/官网契约测试：9/9；共享 Logo、操作台、onboarding 测试：79/79；全仓 typecheck 与 desktop build 通过。
- 实际 `desktop dist` 生成且只生成命名含 `mac-arm64` 的 DMG 与 ZIP；`.app` 和挂载后的 DMG 都是 thin arm64，深度签名有效，ICNS 覆盖 16–1024px。
- `pnpm test` 全量运行 579 项通过 575 项；串行复跑后，pending-switch 的两个超时已通过，剩余 2 项为未触及的 local-console 既有问题：`not-found` / `unreadable` 环境差异和 CEO child orchestration 固定 10 秒超时。
- 已肉眼检查 1024/180/64/32px 图标原始白底与留白；官网 1440px/375px、desktop 主界面与 onboarding 均无横向溢出、资源 404 或控制台错误。
