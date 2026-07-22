# local-console delta：local-console-managed-attachments

## Requirement: 本地附件使用应用托管副本
Source: docs/product/pages/main-conversation.md#添加与发送附件

系统 MUST 将本地附件内容写入数据根下的专用托管目录，并在既有 `.state/local-console.sqlite` 中把不可变 blob 元数据与草稿/消息有序 refs 分开持久化。blob MUST 保存服务端判定的种类、显示名、媒体类型、实际字节数、完整性摘要和服务端生成的相对存储键；ref MUST 保存 renderer 可见的不透明 attachment id、blob 关联、draft/message 二选一归属和稳定顺序。系统 MUST NOT 把内部 blob id、原始绝对路径、托管绝对路径或本轮附件副本路径写入附件 DTO、缩略图响应、消息正文或 renderer 可见 attachment id。

附件原件写入 MUST 流式执行并受有界字节护栏约束；完成内容写入前 MUST NOT 建立可发送的附件元数据。服务端 MUST 只把 magic bytes 识别为 PNG、JPEG、GIF 或 WebP 且已经完成有界 PNG preview finalization 的附件归类为 ready 图片，preview MUST 最长边不超过 512px 且编码后不超过 2MiB。系统 MUST NOT 仅凭客户端 MIME 或扩展名把 HTML、SVG、畸形图片或其他内容提升为图片预览。renderer MUST 只读取派生缩略图，MUST NOT 通过附件端点读取完整托管原件。

### Scenario: 原文件删除后托管附件仍可用
- GIVEN 用户已把本地图片加入草稿且托管写入完成
- WHEN 原文件被移动或删除并且应用重启
- THEN 同一 draft key 仍能恢复附件元数据并读取托管内容
- AND 系统不重新访问原路径。

### Scenario: 已发送附件通过新引用复用
- GIVEN 同一 session 的一条历史 user message 已引用两个托管 blobs
- WHEN 系统为“改一改重发”目标 draft 原子克隆其附件引用
- THEN 目标 draft 获得两个新的 attachment ids 并保持原顺序
- AND 原 message refs 与两个 blobs 保持不变
- AND 系统不复制 blob 字节。

### Scenario: 伪装图片按普通文件处理
- GIVEN 一个扩展名和客户端 MIME 声称为 PNG、但内容不是受支持图片的文件
- WHEN local-console 完成服务端内容识别
- THEN 该附件不会获得图片预览或进入 Codex `imagePaths`
- AND 它至多按普通文件附件处理。

### Scenario: 上传中断不产生 ready 附件
- GIVEN 附件字节流在完成前中断或超过高位护栏
- WHEN 服务端收敛本次写入
- THEN SQLite 中不存在可发送的对应 ready 附件
- AND partial 内容被删除或由启动清理有界回收。

### Scenario: 超大尺寸或畸形图片上传失败
- GIVEN 一个具有受支持图片签名、但无法在预览预算内安全解码的附件
- WHEN renderer 无法生成有界 PNG preview，或 preview finalization 超过服务端字节上限
- THEN 系统不建立 ready 附件元数据
- AND 界面保留可重试或移除的失败项，不把它伪装成普通文件。

## Requirement: 正文与有序附件原子形成用户消息
Source: docs/product/pages/main-conversation.md#添加与发送附件

首条消息创建和已有会话消息提交 MUST 接受正文加有序 attachment ref ids，并允许“正文 trim 后非空”或“至少一个 ready ref”任一条件满足发送。系统 MUST 在一个 SQLite transaction 中创建 pending 用户消息并把全部 refs 从正确的 draft key 转为该消息的有序归属；首次发送还 MUST 在同一 transaction 中创建 session。任一 ref 或 blob 缺失、未就绪、归属错误或 ref 已经被 claim 时，系统 MUST 回滚 session、message 和全部 refs 归属。

旧的 body-only 请求 MUST 继续可用。纯附件首条消息 MUST 使用第一个附件显示名生成稳定标题，MUST NOT 因空正文拒绝创建。

### Scenario: 纯附件首条消息创建会话
- GIVEN 新对话草稿包含一个 ready 图片且正文为空
- WHEN 用户发送
- THEN 系统创建一段 session 和一条包含该图片的 pending 用户消息
- AND 标题来自第一个附件显示名
- AND local runtime 开始处理该消息。

### Scenario: 多附件有一个归属错误
- GIVEN 请求包含三个附件，其中一个不属于当前 draft key
- WHEN SQLite worker 校验并尝试提交
- THEN 不创建用户消息
- AND 其余两个附件仍属于原草稿
- AND 不启动 Codex。

### Scenario: 旧正文请求保持兼容
- GIVEN 一个旧客户端只提交非空 `body`
- WHEN 它调用既有 session-scoped message endpoint
- THEN 系统仍创建一条没有附件的 pending 用户消息
- AND 既有串行执行语义不变。

## Requirement: 本地附件端点保持 capability 与归属边界
Source: docs/product/pages/main-conversation.md#添加与发送附件

附件原件上传、图片 preview finalization、派生缩略图读取、移除和历史 refs 克隆端点 MUST 要求桌面启动时生成并通过窄 preload 能力提供的随机 capability；缺失或错误 capability MUST 在读取或写入文件前拒绝。普通文件卡片 MUST 只消费元数据，renderer MUST NOT 获得任意普通文件内容读取能力。系统 MUST 校验 attachment id、draft key、session/message 归属与所有解析后路径仍在托管根或当前 runDir 输入目录内，MUST NOT 接受客户端提供的 blob id 或文件系统目标路径。

消息和草稿的 `attachments` 字段 MUST 只暴露结构化显示元数据与不透明 id；既有 local-console 诊断字段不因本 change 扩张或重构。图片缩略图读取 MUST 使用结构化附件通道，MUST NOT 放宽 Markdown 对 `file:`、`data:`、`javascript:` 或自定义协议的禁用。

### Scenario: renderer 的附件载荷看不到本地路径
- GIVEN 已发送消息包含图片和普通文件
- WHEN renderer 读取 session view 和附件缩略图
- THEN `attachments` 字段和预览响应不包含 blob id、原始路径、托管路径、storage key 或本轮附件副本路径
- AND 图片通过有 capability 的派生缩略图读取转成临时 Blob 预览。

### Scenario: 取消在途上传不留下 ready 附件
- GIVEN 一个附件仍在流式上传
- WHEN 客户端取消请求或连接中断
- THEN local-console 不建立 ready 附件元数据
- AND partial 内容被删除或进入有界孤儿清理。

### Scenario: 跨 session 克隆附件引用被拒绝
- GIVEN source user message 属于 session A，目标 draft 属于 session B
- WHEN 客户端请求把 source refs 克隆到目标 draft
- THEN local-console 在创建任何新 ref 前拒绝请求
- AND source message refs、目标 draft 和 blobs 均不改变。

### Scenario: 路径穿越显示名
- GIVEN 文件显示名包含目录分隔符或 `..`
- WHEN 服务端持久化并准备运行副本
- THEN 真实存储路径仍只由不透明 id 和固定/清洗后的服务端片段构成
- AND 解析结果始终位于预期根目录。

## Requirement: prompt 范围附件生成本轮安全副本
Source: docs/product/pages/main-conversation.md#添加与发送附件

local runtime MUST 在调用 Codex 前按本轮 prompt 范围和消息内顺序，把托管附件复制到当前 `runDir/input-attachments/`，并为每项生成带时间线消息来源、显示名、类型、大小和受控运行路径的 prompt manifest。PNG、JPEG、GIF、WebP 图片 MUST 按相同稳定顺序传入 `CodexRunOptions.imagePaths`；普通文件 MUST NOT 进入 `imagePaths`，只通过 manifest 供 Agent 读取。

任一附件准备失败时，系统 MUST NOT 调用 Codex或静默省略失败附件；它 MUST 留下可见、可重试的本地系统事实并释放 session。重试 MUST 从托管副本重新准备，不得访问原路径。

### Scenario: 图片和普通文件进入不同输入通道
- GIVEN prompt 范围包含一张 PNG 和一个 PDF
- WHEN runtime 准备本轮输入
- THEN 两者都存在于当前 runDir 输入附件目录并出现在 prompt manifest
- AND 只有 PNG 路径出现在 Codex `imagePaths`。

### Scenario: 准备失败释放 session
- GIVEN 一条已 claim 消息的托管附件在复制到 runDir 时失败
- WHEN runtime 处理该失败
- THEN Codex driver 没有被调用
- AND session 不再占用 running claim
- AND 用户可以基于同一托管附件重试。
