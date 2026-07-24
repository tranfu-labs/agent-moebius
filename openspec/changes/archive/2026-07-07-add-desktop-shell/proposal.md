# 提案：add-desktop-shell

## 背景

- 项目当前的运行形态是两个终端进程：`pnpm start` 跑常驻 runner，`pnpm observer` 跑本地只读观察页。使用者必须克隆仓库、装 pnpm、开两个终端，才能把全部功能跑起来。
- 目标是对标 Codex Desktop 的纯本地桌面应用：启动应用即启动当前全部功能，直接调用本机 codex CLI 与 gh CLI，不引入任何云端依赖。
- 计划公开发布。当前没有苹果开发者签名证书，但更新通路必须第一版就搭好；证书到位后再补 macOS 自动更新与公证。
- 壳层选型经横评定为 Electron（依据与取舍见 `docs/adr/0001-desktop-shell-electron.md`）：代码库是纯 Node/TypeScript，Electron 主进程即 Node 运行时，runner 与 observer 原样复用；对标产品 Codex Desktop 与 Claude 桌面端同为 Electron。

## 提案

新增 `desktop/` 包（Electron 壳），根仓库转为 pnpm workspace：

1. 主进程只做装配：数据根解析 → PATH 修复 → 首启种子拷贝 → 环境自检（codex / gh）→ 进程内启动 observer（动态端口，保持只读）→ 以 utilityProcess 派生 runner 子进程 → 打开状态页主窗口；关窗时统一收尾退出。
2. 数据根固定为 `~/.moebius`（打包态默认，对齐 codex CLI 的 `~/.codex` 习惯；开发态默认仓库根；环境变量可覆盖）。runner 子进程工作目录指向数据根，`.state/` 等相对路径自然落位；workdir 根由壳层注入数据根下路径。
3. 壳层业务逻辑全部拆成纯模块并配单元测试：数据根解析与种子拷贝计划、macOS 图形进程 PATH 修复、环境自检解析、runner 子进程状态机（崩溃退避重启）、更新策略平台分支。
4. 主窗口为状态指示页（版式见 `wireframes.md`）：运行状态、环境自检、打开观察页 / 数据目录、检查更新。
5. 更新机制：Windows/Linux 走 electron-updater 全自动；macOS 无证书期间做「检查更新 → 跳转下载页」。发布通路为 electron-builder 三平台打包 + GitHub Actions 按 tag 构建上传 GitHub Releases。
6. 现有代码最小改动：`src/config.ts` 新增数据根环境变量覆盖（默认行为不变，CLI 方式照旧可用）；runner 的 `start()` 与 observer 的 `startObserverServer()` 已有编程入口，直接复用。

**范围外（第一版显式不做，留给后续 change）**：托盘常驻（第一版关窗即整体退出）、图形化配置编辑、日志查看界面、macOS 自动更新与签名公证（等证书）、runner 手动启停按钮。

## 影响

- 新增 `desktop-shell` 业务域 spec（归档时合并 `spec-delta/`）；`github-issue-runner`、`goal-ledger` 两域行为规则不变。
- observer 只读边界不变：壳层不给 observer 增加任何写接口，启停 runner 这类写能力全部在壳层主进程。
- 仓库结构：根目录新增 `pnpm-workspace.yaml` 与 `desktop/` 包；新增 `.github/workflows/release-desktop.yml`。
- 运行方式新增桌面应用形态，`pnpm start` / `pnpm observer` 的终端形态继续有效且行为不变。
- 版式事实源新增桌面状态页（归档时回流 `docs/wireframes/pages/desktop-status.md`）；架构事实源新增桌面壳拓扑图（归档时回流 `docs/architecture/`）。
