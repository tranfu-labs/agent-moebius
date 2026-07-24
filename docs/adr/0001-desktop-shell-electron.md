# 0001. 桌面应用壳选型 Electron

## 状态
accepted

## 背景
项目要把 runner（常驻扫描 GitHub issue、驱动本机 codex CLI）与 observer（本地只读观察页）包装成纯本地桌面应用：启动应用即启动全部功能，直接调用本机 codex 与 gh，计划公开发布并需要更新机制（暂无苹果签名证书）。候选壳层为 Electron 与 Tauri。

关键事实：

- 代码库为纯 Node.js + TypeScript；runner 与 observer 均已有编程入口（`start()` / `startObserverServer()`）。
- Electron 主进程即 Node 运行时，现有代码可原样复用；Tauri 壳层为 Rust，Node 代码必须用 pkg/bun 编译成边车二进制随包分发，多一条打包与调试链路。
- 对标产品 Codex Desktop 与 Claude 桌面端均为 Electron；行业惯例是「核心为 Node 的选 Electron，核心为 Rust 的选 Tauri（如 GitButler、Yaak）」。
- 更新机制：electron-updater + GitHub Releases 通路成熟；macOS 自动更新强制要求签名，无证书期间 macOS 只能做「检查更新 → 跳转下载页」。Tauri 更新器虽不依赖苹果证书，但未签名应用在 macOS 首装照样被拦，不构成选型差异点。
- Tauri 的真实优势为安装包体积（约 10-20MB 对约 100-150MB）与常驻内存（几十 MB 对 200-400MB）。

## 决策
选 Electron 作为桌面应用壳：新增 `desktop/` 包，主进程装配现有 runner（utilityProcess 子进程）与 observer（进程内只读启动），业务逻辑保持在现有模块，壳层只做装配、监管、自检与更新提示。数据根采用 `~/.moebius`（对齐 codex CLI 的 `~/.codex` 习惯）。无证书期间更新策略：Windows/Linux 全自动，macOS 检查后跳转下载页。

## 后果
- runner / observer 代码零重写，桌面形态与终端形态共用同一套实现，行为一致。
- 接受安装包约 100-150MB、常驻内存高于 Tauri 的代价；自带 Chromium 换来三平台渲染一致。
- 未签名阶段 macOS 首装需用户在系统设置手动放行；证书到位后需补签名、公证与 macOS 自动更新（后续变更）。
- 若未来 runner 改写为 Rust 或对常驻内存出现硬指标，可迁移 Tauri；界面层为网页技术，可复用。
