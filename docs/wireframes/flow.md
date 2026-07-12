# Wireframe Flow Notes

## Local Console

The desktop operator console is the default local experience. Its auxiliary status and observer diagnostics share `docs/wireframes/pages/console.md` as the current page fact source.

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
  │    ├─ 127.0.0.1 动态端口启动 local console server
  │    └─ utilityProcess 派生 runner child
  │
  ├─ 操作台主窗口接收主进程快照
  │    ├─ runner 状态 / 崩溃重启进度 / 日志路径
  │    ├─ local console URL
  │    ├─ 持久化本地项目 / 多会话列表
  │    │    ├─ [打开项目] → preload 原生目录选择 → local console API 持久化 project
  │    │    ├─ 每个 project 行 [＋] → 在该 project 新建并选中空白 session
  │    │    ├─ 空白 session 的 composer 项目菜单 → 原 session id 重绑到目标 project
  │    │    │    ├─ 草稿与选中态保持
  │    │    │    └─ 有消息 / run / parent / child → 项目锁定，不显示菜单
  │    │    ├─ create / open / rebind 共用 selection mutation gate
  │    │    │    ├─ pending 时禁用并二次拦截其它 selection 入口与首条消息
  │    │    │    ├─ owner refresh 可抢占旧 lease，非 owner refresh 不得提交
  │    │    │    └─ 周期 refresh single-flight，慢请求不会被下一 tick 饥饿
  │    │    ├─ flat sessions 可带 parentSessionId 供运行时编排与恢复
  │    │    ├─ renderer 始终渲染 project → peer session 平铺列表
  │    │    ├─ 刷新后恢复同级列表与选中会话，不展示父子层级
  │    │    └─ missing parent / self-parent / cycle → 每个 session 仍只显示一次
  │    ├─ 当前会话时间线
  │    ├─ active run 直播块 / runDir / elapsed / tail
  │    ├─ 中断按钮
  │    └─ interrupted / failed / stuck 本地记录
  │
  ├─ [诊断] → 辅助状态页
  │    ├─ observer 地址与打开按钮
  │    ├─ 环境自检结果
  │    ├─ 数据目录与更新入口
  │    └─ runner / local console / observer 状态
  │
  ├─ [打开观察页] 或独立运行 pnpm observer
  │    └─ 默认浏览器打开 observer 动态端口地址
  │         ├─ HTTP request / browser refresh 时读取 config 与 .state
  │         ├─ 构建只读 ledger-first goal → milestone → task 模型
  │         ├─ 映射 owner phase、gate、child acceptance、integration event
  │         ├─ 只把显式 TaskRecord.runManifestRefs 作为 task evidence
  │         ├─ 保留 Unlinked local runs 与 legacy issue/run diagnostics
  │         ├─ ledger 失败不影响 legacy issue/run 区域
  │         └─ 无操作按钮 / watcher / GitHub / Codex / publisher / 状态写入
  ├─ [打开数据目录] → 系统文件管理器打开数据根
  ├─ [检查更新]
  │    ├─ macOS：读取 GitHub latest release，有新版则跳转下载页
  │    └─ Windows/Linux：electron-updater 自动下载安装
  │
  └─ 关闭窗口 → 停 runner → 关 local console server → 关 observer → 应用退出
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
