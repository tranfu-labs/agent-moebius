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
  │    │    ├─ 打包态默认 ~/.moebius
  │    │    ├─ 开发态默认仓库根
  │    │    └─ MOEBIUS_DATA_ROOT 覆盖
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
  │    └─ macOS Apple Silicon：读取 GitHub latest release，有新版则跳转下载页
  │
  └─ 关闭窗口 → 停 runner → 关 local console server → 关 observer → 应用退出
```

## Landing（moebius）

```text
部署 sites/marketeam/ → 打开唯一入口 index.html（Moebius 品牌）
  │
  ├─ 页头显示 64px 母版派生图标；head 声明 32px favicon + 180px Apple Touch Icon
  ├─ skip link → #main；页头锚点 → why / how / trace / start
  ├─ 首屏：任务沿接手→处理→复核→交付推进
  │     └─ 首次复核失败 → 返回处理 → 再次复核通过
  ├─ 旧世界：桌面粘性五拍随滚动切换场景
  │     └─ ≤760px 降级为顺序卡片，避免触屏滚动跳拍
  ├─ 角色移交：你在多个推进位置间切换 → Moebius 接走角色 → 只留拍板席
  ├─ 三个时刻：先对齐目标与边界 → 按要求逐条验收 → 带原因打回/重做/再验
  ├─ 过程底单：对齐→接手→打回→重做→拍板→验收
  │     └─ 明示“完整底单仍在做 / 示例记录·非产品实拍”
  ├─ 开始行动：Apple Silicon Mac + Codex CLI 或 Claude CLI 版本命令
  │     ├─ 官方安装指引可打开
  │     └─ 下载/源码未开放 → 按钮 disabled + 如实说明
  ├─ IntersectionObserver 管理循环/一次性动效
  │     ├─ 离开视口或页面 hidden → 暂停循环
  │     ├─ pageshow/resize → 重算首屏、接力棒与角色路径
  │     └─ prefers-reduced-motion → 静态可读终态
  │
  └─ 静态托管只发布 sites/marketeam/
       ├─ 无 build / API / SSR / env / SPA rewrite
       ├─ index.html 与 assets/ 下三个品牌图标一同发布
       └─ 回滚 = 恢复上一稳定 index.html 与 assets/ 后重新部署
```
