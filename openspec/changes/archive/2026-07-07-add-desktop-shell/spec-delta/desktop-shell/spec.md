# desktop-shell 规格

## 域定位
`desktop-shell` 负责把 runner 与 observer 装配成一个纯本地桌面应用（Electron 壳）：启动应用即启动当前全部功能，直接调用本机 codex CLI 与 gh CLI。壳层只做装配、子进程监管、环境自检与更新提示，不承载任何业务规则；runner 与 observer 的行为事实源仍在 `github-issue-runner` 与 `goal-ledger` 域。终端形态（`pnpm start` / `pnpm observer`）继续有效且行为不变。

## 业务规则

### 启动与退出
- MUST 启动应用即依次完成：数据根解析 → PATH 修复 → 首启种子拷贝 → 环境自检 → 启动 observer 服务 → 派生 runner 子进程 → 打开状态页主窗口。
- MUST 持有单实例锁：第二个应用实例启动时激活已有窗口后退出，NEVER 出现两个实例同时派生 runner 或并发写 `.state/`。
- MUST 在种子拷贝失败时不派生 runner 子进程，并把失败原因呈现在状态页；NEVER 让 runner 在缺失 `config.toml` 的数据根上静默启动失败。
- MUST 在关闭主窗口时先停止 runner 子进程（温和信号，超时后强杀）、再关闭 observer，然后退出应用；NEVER 留下孤儿子进程。
- MUST 让环境自检失败（codex 缺失、gh 未登录等）只体现在状态页，NEVER 阻断应用启动。

### 数据根
- MUST 打包态数据根默认为 `~/.moebius`，开发态默认为仓库根；`MOEBIUS_DATA_ROOT` 环境变量为最高优先级覆盖。
- MUST 把 runner 子进程工作目录设为数据根，使 `.state/` 等相对路径状态文件落在数据根下。
- MUST 在打包态为 runner 子进程注入 `MOEBIUS_WORKDIR_ROOT=<数据根>/workdir`，NEVER 让 workdir 按默认规则落在应用包附近。
- MUST 首启把 `agents/`（含 `ceo-scripts/`）与示例 `config.toml` 种子拷贝到数据根；已存在的文件 NEVER 覆盖。
- MUST 保持 `src/config.ts` 在未设置数据根环境变量时行为与终端形态完全一致。

### observer 边界
- MUST 在壳内以 `127.0.0.1` + 动态端口启动 observer，并把实际端口呈现在状态页。
- MUST 保持 observer 只读旁路语义：壳层 NEVER 给 observer 增加写接口、操作按钮或 runner 控制能力；启停 runner 属于壳层主进程能力。

### runner 子进程监管
- MUST 用显式状态机监管 runner 子进程：停止 / 启动中 / 运行中 / 已崩溃。
- MUST 在子进程异常退出后按退避策略自动重启；连续崩溃达上限（3 次）后停住并在状态页呈现失败原因与日志位置。
- MUST 把壳层主动停止（退出收尾）与异常退出区分开：主动停止 NEVER 触发自动重启。
- MUST 捕获 runner 子进程的 stdout/stderr 并落盘到数据根 `logs/` 下（按启动分文件），供崩溃排查；日志写入失败 NEVER 中断 runner 运行。

### 环境自检与 PATH
- MUST 探测 codex 可执行、gh 可执行与 gh 登录态，并以结构化结果渲染到状态页。
- MUST 在 macOS 图形进程内做 PATH 修复（合并登录 shell 的 PATH）；读取失败时保底沿用原 PATH。

### 更新
- MUST 按平台分支更新策略：Windows/Linux 通过 electron-updater 对接 GitHub Releases 自动更新；macOS 在无签名证书期间「检查更新 → 有新版则跳转下载页」。
- MUST 把版本比较与平台分支决策保持为纯逻辑模块。

### 架构约束
- MUST 把壳层业务逻辑（数据根解析、种子拷贝计划、自检解析、子进程状态机、更新分支）拆为不依赖 Electron 运行时的纯模块并配单元测试；装配层 NEVER 承载业务规则。
- MUST 限定状态页 IPC 为四个口：状态快照推送、打开观察页、打开数据目录、检查更新；NEVER 暴露配置写接口。
- MUST NOT 把 runner / observer 的行为规则复制进本域；本域只引用它们的编程入口（`start()`、`startObserverServer()`）。
