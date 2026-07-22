# desktop-shell spec delta：main-conversation-streamdown-markdown

## ADDED Requirements

### Requirement: Markdown 外链通过窄 IPC 交给系统浏览器
Source: docs/product/pages/main-conversation.md#时间线

桌面壳 MUST 为已确认的 Markdown 外链提供单用途 preload IPC。主进程 MUST 使用 URL parser 再次验证绝对 URL，只允许 `http:`、`https:`、`mailto:` 后调用 `shell.openExternal`；malformed、relative、`file:`、`data:`、`javascript:` 与自定义协议 MUST 被拒绝。renderer MUST NOT 获得任意 shell、文件打开或窗口创建能力。

#### Scenario: 合法与非法链接在主进程分流
- GIVEN renderer 依次提交 HTTPS URL、mailto URL、file URL 与 malformed text
- WHEN preload 调用外链 IPC
- THEN 主进程只为前两项调用 `shell.openExternal`
- AND 后两项不触发 shell、文件系统或窗口副作用

### Requirement: 主窗口拒绝 Markdown 直接导航
Source: docs/product/pages/main-conversation.md#时间线

主 BrowserWindow MUST 拒绝 renderer 内容创建新窗口，并 MUST 阻止离开应用自身页面的 top-level navigation。链接确认与系统浏览器 IPC MUST 是 Markdown 外链的唯一打开路径；context isolation 与 node integration 禁用边界 MUST 保持不变。

#### Scenario: Markdown 尝试绕过外链 IPC
- GIVEN Markdown link 或 raw HTML 尝试使用 target、window.open 或 top-level navigation
- WHEN 用户激活该内容
- THEN 主窗口不新建窗口且不离开操作台页面
- AND renderer 仍不能访问 Electron、Node 或本地文件 API
