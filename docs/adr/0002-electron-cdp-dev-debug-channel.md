# 0002. dev 期为 Electron 打开 Chromium 远程调试端口

## 状态
accepted

## 背景
桌面壳 Electron（见 [0001](0001-desktop-shell-electron.md)）在 dev 期对 AI agent 不友好：GUI 窗口只能截屏或系统级自动化硬驱，主进程与渲染进程日志分裂，且已知隐藏标签页会冻结 WAAPI 使动画验证失真。项目已在使用基于 CDP 的浏览器调试 MCP，AI agent 已具备通过 Chrome DevTools Protocol 观察 Chromium 的心智基础。

关键事实：

- `desktop/src/main.ts` 现有 IPC 面很小（7 个 handler + 1 个 status push），preload 只暴露 `window.agentMoebius` 一个面。
- 已有 ADR-0001 承诺主进程为 Node 运行时，业务逻辑与桌面壳解耦仍未完成。
- 生态里有多个专用 Electron MCP server 可选：Playwright 派（`electron-driver` / `playwright-mcp-electron`）要求 MCP 自己 `start_app`，无法 attach 用户手动启动的窗口；CDP 派（`@laststance/electron-mcp-server`）走 `--remote-debugging-port` 端口 attach 已运行进程。
- 用户实际调试场景是「自己 `pnpm desktop` 起窗口 + AI 陪调同一个窗口」，与 Playwright 派的会话所有权模型硬冲突。
- 更长期方向是 renderer 独立 vite / backend 独立 Node 的分体调试架构，但改造预算超「最小验证」范围，本 ADR 不落地。

## 决策
在 dev-only 条件下（`!app.isPackaged`）为 Electron 打开 Chromium 远程调试端口 `9222`，允许 AI agent 通过 CDP 走 `@laststance/electron-mcp-server` attach 已运行的 desktop 进程。具体：

- `desktop/src/main.ts` 在 `app.whenReady()` 之前调用 `app.commandLine.appendSwitch("remote-debugging-port", "9222")`，`isPackaged` 判断保证打包版本永不开放端口。
- 项目根新增 `.mcp.json` 注册 `electron` MCP server，指向 `@laststance/electron-mcp-server`。
- AGENTS.md 补一段说明 9222 端口用途与冲突排查。

被否决的备选：

- **A. renderer / backend 分体调试**：是长期理想终态，本次成本超预算；ADR 承认为未来方向，不作废。
- **B. Playwright 拥有会话**（`electron-driver`）：MCP 必须 `start_app` 自己起 Electron，不能 attach 用户手动跑的窗口，与陪调场景硬冲突。
- **C. 保持现状**（截屏 + 系统自动化）：主进程完全黑盒，不可持续。
- **D. 自建 CDP harness**（`webContents.debugger.attach()` 编程接入）：灵活但要自建整套 tool surface，生态里已有成熟方案，暂无必要。

## 后果
- AI agent 能同时读主进程 / 渲染进程 / console 三路日志，并可 eval 主进程与渲染进程；心智与已有 CDP 浏览器 MCP 一致，工具面板可复用。
- IPC 面、preload、`console-ui`、`runner-supervisor` 均零改动；回退代价 = 删 3 行代码 + 2 个配置文件。
- 引入外部 npm 依赖 `@laststance/electron-mcp-server`；需观察其维护活跃度，停滞时可切备选 D。
- dev 环境 9222 端口通过 loopback 暴露；风险面为本机其他进程可 CDP 控制 desktop 窗口。缓解：`isPackaged` 判断确保仅 dev 生效，且 Chromium 默认只绑 localhost。
- 端口冲突（9222 被 Chrome debugger 或其他 CDP 工具占用）会导致 `pnpm desktop` 启动失败；AGENTS.md 补排查说明。
- 分体调试架构（renderer / backend 独立）仍是长期方向，若本方案证明「AI 陪调」有价值，后续新起 ADR 承接。
