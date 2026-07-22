# desktop-shell delta：local-console-managed-attachments

## Requirement: desktop renderer 通过窄能力接入本地附件
Source: docs/product/pages/main-conversation.md#添加与发送附件

desktop main MUST 为每次应用启动生成仅用于 local-console 附件端点的随机 capability，并把同一 capability 注入 main process 拥有的 local console server 和窄 preload API。renderer MUST 用 Chromium 图片解码能力为 PNG/JPEG/GIF/WebP 生成有界 PNG preview，再通过 loopback local-console 附件 API 流式上传原件、finalize preview、恢复元数据、读取派生缩略图和移除未发送附件。renderer MUST NOT 获得完整托管原件或普通文件任意内容读取能力，也 MUST NOT 启用 Node integration、直接读写文件系统、SQLite 或托管附件目录。

preload MUST NOT 暴露通用文件读取、任意路径读取或任意 HTTP header 能力；capability MUST NOT 写入日志、持久化草稿、消息 DTO 或可见 DOM URL。

### Scenario: 选择文件后仍由 local-console 持久化
- GIVEN Electron renderer 从浏览器 File API 收到用户选择的文件
- WHEN 它准备附件草稿
- THEN 它携带窄 capability 调用 loopback attachment endpoint
- AND main/preload 不直接写消息或 SQLite
- AND renderer 不获得原始文件系统路径。

### Scenario: 外部来源缺少 capability
- GIVEN 另一个本地网页知道 local console 端口但没有当前启动 capability
- WHEN 它尝试写入或读取附件内容
- THEN local console server 在文件 IO 前拒绝请求。

### Scenario: 移除 pending 附件抑制迟到响应
- GIVEN 一个附件仍在流式上传且用户已从草稿移除它
- WHEN renderer 取消请求而服务端或网络随后返回结果
- THEN renderer 立即撤销本地占位并忽略该上传的迟到结果
- AND 已移除附件不会重新出现在原草稿。

## Requirement: desktop 发送编排保持选择与草稿一致
Source: docs/product/pages/main-conversation.md#指标与验收

desktop renderer MUST 在首次发送和已有 session 发送中同时提交正文与当前 draft key 的有序 ready attachment ids。selection mutation 或发送已经在途时，handler 边界 MUST 拒绝重复附件提交；API 成功后才清空对应正文与附件草稿，失败或过期响应 MUST 保留草稿和原选择。

### Scenario: 首次发送原子创建含附件会话
- GIVEN 新对话已选项目且草稿含正文和多个 ready 附件
- WHEN 首次发送成功
- THEN renderer 选择服务端返回的 session
- AND 只清空 `draft:new` 的正文与附件
- AND 其他 session 的草稿不变。

### Scenario: selection mutation 阻止附件重复提交
- GIVEN create/open/rebind mutation 已经拥有 selection gate
- WHEN 又发生发送或附件提交 intent
- THEN handler 不发送第二个消息请求或附件归属请求
- AND 现有草稿保持不变。
