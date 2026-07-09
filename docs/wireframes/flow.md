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

## Marketeam Landing

```text
打开 sites/marketeam/index.html
  │
  ├─ 背景 CSS mesh 渐变铺满 .app
  ├─ 入场动画错峰：header 下淡入 → hero 左上淡入 → 圆环 scale-in(0.3s) → ticker 上淡入(0.6s)
  ├─ 400ms 起 打字机逐字（35ms/字，前67字黑/余白，紫光标闪）
  │     └─ 打字完 → Start Project(3.2s) → David 徽章(3.6s) 依次入场
  ├─ 1.2s 起 中心数字 count-up 0→20k+（easeOutCubic 2s）
  ├─ 4 轨持续旋转（左30/右40/右50/左60 s），头像随轨转、中心数字与头像反向自转正立
  ├─ 头像错峰 fly-in（scale0.3+rotate-180+blur → 正常，0.6→2.3s）
  │     └─ hover 头像 → 弹标注框（姓名·角色 + AI 生成提示词 + 复制）
  ├─ 底部 ticker 5 标×4 无缝左滚 20s，两端渐隐
  ├─ 断点 1280/1024/768/480：逐档缩标题与圆环，≤1024 堆叠，≤768 隐藏 nav，无横向滚动
  │
  └─ 继续向下滚动（同页正文，如实介绍 agent-moebius）
       ├─ 每段 IntersectionObserver 滚入一次性淡入（prefers-reduced-motion 降级直显）
       ├─ ① 是什么：定位一句话 + 3 概念芯片
       ├─ ② 怎么跑：Watch→Normalize→Trigger→Guard→Track 真实闭环（≤768 纵向堆叠）
       ├─ ③ AI 团队：7 角色卡，hover 出角色真实 charter（复用首屏 tooltip，无复制）
       └─ ④ 目标账本：goal→milestone→task→phase + 过程保证芯片 + Get started CTA + footer
```
