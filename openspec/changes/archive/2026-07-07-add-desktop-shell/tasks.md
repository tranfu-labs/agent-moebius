# 任务：add-desktop-shell

- [x] 1. 仓库转 pnpm workspace，新增 `desktop/` 包骨架（electron、electron-builder、esbuild、vitest 接入；根包脚本不受影响）
- [x] 2. `src/config.ts` 新增数据根环境变量覆盖（`config.toml` / `config.local.toml` / `agents/` 解析位置），默认行为不变 + 单测
- [x] 3. `desktop/src/data-root.ts`：数据根解析（打包态 `~/.agent-moebius` / 开发态仓库根 / 环境变量覆盖）+ 种子拷贝计划（已存在不覆盖；核实 `prompts/` 确无运行时引用）+ 单测
- [x] 4. `desktop/src/shell-path.ts`：登录 shell PATH 读取合并、失败保底 + 单测
- [x] 5. `desktop/src/env-doctor.ts`：codex / gh 探测与登录态解析 + 单测
- [x] 6. `desktop/src/runner-supervisor.ts`：子进程状态机（崩溃退避重启、连续 3 次停住、手动停止不重启）+ 单测
- [x] 7. `desktop/src/updater.ts`：版本比较 + 平台分支（macOS 跳转下载页 / Windows/Linux 自动更新）+ 单测
- [x] 8. `desktop/src/main.ts` 装配 + `runner-child.ts` + `preload.ts` + 状态页（按 `wireframes.md` 版式）+ 窄 IPC 四个口 + runner 子进程日志落盘到数据根 `logs/` + 单实例锁
- [x] 9. electron-builder 三平台配置（dmg/zip、nsis、AppImage → GitHub Releases）+ `.github/workflows/release-desktop.yml` 按 tag 构建上传
- [x] 10. AI 验证流程逐条跑通：
  - [x] 开发模式启动应用，截图核对状态页（runner 运行中、observer 端口可访问、自检结果与本机一致）
  - [x] 点「打开观察页」，observer 页正常渲染
  - [x] 手动杀 runner 子进程，状态页走完「已崩溃 → 重启中 → 运行中」
  - [x] `pnpm test`、`pnpm typecheck` 全绿
  - [x] 本机打出 dmg 安装启动，数据根落在 `~/.agent-moebius`、状态页正常（未签名，手动放行）
- [x] 11. 更新 AGENTS.md（项目结构、常用命令、数据根约定、「两种形态不得同时监听相同仓库」的双形态约束）与 `docs/architecture/module-map.md`（新增 desktop-shell 模块条目）
