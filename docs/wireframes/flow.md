# Wireframe Flow Notes

## Observer

```text
pnpm observer
  │
  ├─ HTTP request / browser refresh
  │    │
  │    ├─ read config.toml + config.local.toml
  │    ├─ read .state/goal-ledger.json
  │    ├─ read .state/github-response-intake.json
  │    ├─ read .state/role-threads.json
  │    ├─ read .state/agent-contexts.json
  │    └─ read .state/run-manifests.jsonl
  │
  ├─ build read-only observer model
  │    ├─ validate / diagnose ledger without writing it
  │    ├─ filter ledger goals by watched repository references
  │    ├─ map goal → milestone → task tree
  │    ├─ map owner phases, gates, child acceptance, integration events
  │    ├─ attach only explicit TaskRecord.runManifestRefs evidence
  │    ├─ keep unrelated run manifests in Unlinked local runs
  │    └─ preserve legacy issue/run records as secondary diagnostics
  │
  └─ render HTML page
       ├─ ledger-first tree view
       ├─ ledger read failure does not break legacy issue/run section
       ├─ no operation buttons
       ├─ no watcher
       ├─ no GitHub / Codex / publisher calls
       └─ no writes to config, .state, manifests, artifacts, releases, or worktrees
```

## Desktop Status

```text
启动桌面应用
  │
  ├─ 获取单实例锁
  │    └─ 第二实例启动 → 激活已有窗口并退出
  │
  ├─ 主进程启动序列
  │    ├─ 解析数据根
  │    │    ├─ 打包态默认 ~/.agent-moebius
  │    │    ├─ 开发态默认仓库根
  │    │    └─ AGENT_MOEBIUS_DATA_ROOT 覆盖
  │    ├─ macOS 图形进程 PATH 修复
  │    ├─ 首启种子拷贝 agents/ + config.toml
  │    ├─ 环境自检 codex / gh / gh auth
  │    ├─ 127.0.0.1 动态端口启动 observer
  │    └─ utilityProcess 派生 runner child
  │
  ├─ 状态页接收主进程快照
  │    ├─ runner 状态 / 崩溃重启进度 / 日志路径
  │    ├─ observer 地址与打开按钮
  │    ├─ 环境自检结果
  │    └─ 数据目录与更新入口
  │
  ├─ [打开观察页] → 默认浏览器打开 observer 动态端口地址
  ├─ [打开数据目录] → 系统文件管理器打开数据根
  ├─ [检查更新]
  │    ├─ macOS：读取 GitHub latest release，有新版则跳转下载页
  │    └─ Windows/Linux：electron-updater 自动下载安装
  │
  └─ 关闭窗口 → 停 runner → 关 observer → 应用退出
```
