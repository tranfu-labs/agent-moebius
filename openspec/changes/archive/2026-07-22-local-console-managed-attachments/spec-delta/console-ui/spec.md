# console-ui delta：local-console-managed-attachments

## Requirement: composer 提供三种等价的本地附件入口
Source: docs/product/pages/main-conversation.md#带附件的输入框与时间线

operator console composer MUST 在右下角把「＋」与发送按钮放在同一操作组；「＋」MUST 打开支持多选的系统文件选择入口。composer MUST 同时把拖入的文件和剪贴板中的图片交给同一个受控 `onFilesAdded` 边界，MUST NOT 把原始本地路径或 `file:` URL插入正文。普通文字粘贴 MUST 保持正文编辑行为。

三种入口 MUST 可独立使用；拖拽 MUST NOT 成为唯一入口。键盘和 screen reader 用户 MUST 能添加、移除、重试并辨认每个附件及其状态。

### Scenario: 三种入口形成同一种草稿项
- GIVEN composer 可编辑
- WHEN 用户分别通过「＋」、拖拽和剪贴板图片加入文件
- THEN 组件都通过同一个受控 callback 输出有序 File 输入
- AND 原始文件路径不进入 textarea。

### Scenario: 粘贴普通文字不创建附件
- GIVEN 剪贴板只有文字
- WHEN 用户在 textarea 粘贴
- THEN 文字进入正文
- AND 不调用图片附件 callback。

## Requirement: 图片与普通文件使用结构化附件呈现
Source: docs/product/pages/main-conversation.md#带附件的输入框与时间线

composer 草稿和已发送用户消息 MUST 在正文之外呈现有序附件：图片使用缩略图和文件名，普通文件使用文件名、类型、大小卡片。pending、failed 与 ready MUST 有非纯颜色的可辨认状态；failed MUST 提供重试和移除，pending MUST 允许移除。附件名称过长或窗口缩窄时 MUST 截断或换行而不产生页面级横向滚动。

结构化附件组件 MUST NOT 把本地资源 URL交给 Markdown renderer。组件卸载或预览替换时 MUST 释放 renderer 创建的临时 object URL。

### Scenario: 图片与 PDF 使用不同卡片
- GIVEN 一条草稿含一张 ready 图片和一个 ready PDF
- WHEN composer 渲染
- THEN 图片显示缩略图，PDF 显示含名称、类型和大小的普通文件卡片
- AND 两项顺序与草稿顺序一致。

### Scenario: 失败附件不清空其他草稿
- GIVEN 草稿含正文、一个 ready 附件和一个 failed 附件
- WHEN failed 卡片显示错误
- THEN 正文和 ready 附件仍在
- AND 用户可对 failed 项重试或移除
- AND 发送保持禁用直到没有 pending/failed 项。

## Requirement: composer 支持纯附件与附件草稿恢复
Source: docs/product/pages/main-conversation.md#输入框

发送可用性 MUST 接受“trim 后正文非空”或“至少一个 ready 附件”任一条件，并在存在 pending/failed 附件、项目未选、selection mutation、不可继续 session 或既有发送禁用条件时保持禁用。成功发送后 MUST 清空当前正文和附件草稿；失败时 MUST 保留二者。

renderer MUST 用 `draft:new` 和 `draft:<sessionId>` 隔离附件草稿，并在切换对话或应用重启后把服务端持久化的附件与对应正文草稿重新组合，MUST NOT 把一个会话的附件显示或提交到另一个会话。

### Scenario: 只有 ready 图片时可发送
- GIVEN 项目已选、没有其他禁用条件、正文为空且有一张 ready 图片
- WHEN composer 计算发送状态
- THEN 发送可用
- AND提交 callback 收到空正文与该图片 id。

### Scenario: 发送失败保留完整草稿
- GIVEN 正文和两个 ready 附件提交失败
- WHEN renderer 收敛失败响应
- THEN 正文和两个附件仍在原 draft key
- AND 用户可以不重新选择原文件直接重试。
