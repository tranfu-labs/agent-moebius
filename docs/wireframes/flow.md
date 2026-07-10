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

## Landing（agent-moebius）

```text
打开 sites/marketeam/index.html（agent-moebius 品牌）
  │
  ├─ 背景 CSS mesh 渐变铺满 .app
  ├─ 入场动画错峰：header 下淡入 → hero 左上淡入 → 圆环 scale-in(0.3s) → ticker 上淡入(0.6s)
  ├─ 400ms 起 打字机 "@mention a role. Your AI team ships it."（首句深/次句白，紫光标闪）
  │     └─ 打字完 → 副文(2.6s) → Get started(3.2s) → @ceo 芯片(3.6s) 依次入场
  ├─ 4 轨持续旋转（左30/右40/右50/左60 s），中心 CEO 与绕轨角色（简化版工牌）反向自转正立（无 count-up）
  ├─ 角色错峰 fly-in（scale0.3+rotate-180+blur → 正常，0.6→2.3s）
  │     └─ hover 角色工牌 → charter 弹框（复用 tooltip）+ ≤±6° tilt + 全息 foil
  ├─ 底部工牌架：7 工牌侧立斜插叠放，两端渐隐，侧面露缩写色卡
  │     ├─ hover：目标工牌【只垂直抬起 translateY-26，不转正不放大】
  │     └─ 点击/Enter：弹簧容器变形（linear() 烘焙弹簧，460ms）——工牌快攻飞抵弹窗内工牌位、~2% 微过冲咬合落定（无贝塞尔死尾），转正由快弹簧前半程完成（拿起读感），途中简化卡面渐变为完整工牌；变形面同弹簧从足迹长成面板、内容不拉伸，【此时才显正面】= 正面放大工牌 + 角色名/charter/@用法（Esc/遮罩/按钮关=280ms 逆向弹簧：临近插槽才侧立落回，键盘可达）
  ├─ 断点 1280/1024/768/480：逐档缩标题与圆环，≤1024 堆叠，≤768 隐藏 nav，无横向滚动
  │
  └─ 继续向下滚动（同页正文，如实介绍 agent-moebius）
       ├─ 每段 IntersectionObserver 滚入一次性淡入（prefers-reduced-motion 降级直显）
       ├─ ① 是什么：定位一句话 + 3 概念芯片
       ├─ ② 怎么跑：Watch→Normalize→Trigger→Guard→Track 真实闭环（≤768 纵向堆叠）
       ├─ ③ AI 团队：7 完整员工工牌网格，hover 出 charter + tilt + 全息 foil
       └─ ④ 目标账本：goal→milestone→task→phase + 过程保证芯片 + Get started CTA + footer
```
