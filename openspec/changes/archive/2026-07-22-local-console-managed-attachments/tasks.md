# 任务：local-console-managed-attachments

- [x] T1：建立托管附件存储与 SQLite 事实
  - [x] 新增本地附件根、高位输入护栏和流式写入/摘要/magic-byte 分类 adapter，支持 staged 图片、preview finalization 与 TTL 清理
  - [x] 新增不可变 blob 表与草稿/消息 ref 表、迁移、安全 DTO 与按引用存活性执行的孤儿/partial 清理
  - [x] 让首条消息创建与普通消息发送原子 claim 有序 refs，并兼容旧 body-only 请求
  - [x] 增加同 session user message refs 到目标 draft refs 的原子克隆能力，保持原 message refs 和 blob 不变

- [x] T2：补 local-console 附件 API 与运行准备链路
  - [x] 实现带 capability 的原件上传、图片 preview finalization、列出、缩略图读取、移除和受控引用克隆端点，确保 renderer 不能读取托管原件且附件响应不含 blob id/本地路径
  - [x] 将 prompt 范围附件复制到 `runDir/input-attachments/`，生成按消息归属的 manifest
  - [x] 图片映射到 `CodexRunOptions.imagePaths`，普通文件只进入受控路径清单
  - [x] 附件准备失败时留下可见可重试事实并释放 session，不静默丢附件

- [x] T3：实现 console-ui 结构化附件交互
  - [x] 在 composer 右下角加入「＋」并支持多文件 input、drag/drop、剪贴板图片
  - [x] 实现图片缩略图、普通文件卡片、pending/failed/ready、移除和重试
  - [x] 支持纯附件发送、窄窗换行、键盘操作和 screen-reader 名称
  - [x] 在用户时间线消息内呈现有序附件，不经过 Markdown URL

- [x] T4：接通 desktop renderer 草稿与发送
  - [x] 以 `draft:new` / `draft:<sessionId>` 上传并恢复附件，保持项目/会话草稿隔离
  - [x] 用独立可测试 helper 将 PNG/JPEG/GIF/WebP 生成有界 PNG preview，preview 成功落盘前保持 pending
  - [x] pending 移除时取消流式上传、清理占位并抑制迟到响应，确保已移除项不会重新出现
  - [x] 首次发送和普通发送同时提交正文与 attachment ids；成功清空、失败保留
  - [x] 为附件请求注入 preload capability，并回收本地 object URL

- [x] T5：完成自动化验证
  - [x] 覆盖 blob/ref 原子性、引用克隆、兼容迁移、路径安全、流式上限、引用存活清理和原文件删除场景
  - [x] 覆盖 API capability/CORS 预检、上传中断、pending 取消、缩略图边界、归属拒绝与附件 DTO 不泄露路径
  - [x] 覆盖 runtime 图片 argv/普通文件 manifest、重试和失败释放 session
  - [x] 覆盖 console-ui 与 desktop renderer 三种入口、纯附件、多附件、草稿恢复和失败保留
  - [x] 运行相关 Vitest、`pnpm typecheck` 与 desktop build

- [x] T6：完成真实 Electron / AI 验证
  - [x] 用「＋」、拖拽、剪贴板分别添加图片与普通文件并检查宽/窄窗口
  - [x] 验证纯附件、多附件、原文件删除后重启、失败后重试
  - [x] 用 CDP 和 fake Codex 证明 DOM/API 无路径泄露、图片进入 `--image`、普通文件只在 runDir manifest
