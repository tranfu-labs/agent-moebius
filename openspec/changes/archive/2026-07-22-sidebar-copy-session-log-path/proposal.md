# 提案：sidebar-copy-session-log-path

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/main-left-sidebar.md | 复制对话记录路径 · 验收 #19 | 对话菜单新增「复制对话记录路径」，路径指向持续更新的记录文件 | 已写入 |
| docs/adr/0004-jsonl-session-fact-log.md | 决策 · 后果 | 记录文件的存在与只读约定 | 已写入 |

## 背景

用户要把一段对话的完整经过交给对话之外的工具或另一个 AI 复盘。对话菜单目前只有「归档」（`packages/console-ui/src/console/conversation-sidebar.tsx` 的 DropdownMenu），没有复制记录路径的入口；记录文件本身由前置 change `session-jsonl-fact-log` 提供。

## 提案

- 对话菜单新增「复制对话记录路径」：触发时把该会话 jsonl 记录文件的**稳定路径**写入剪贴板，成功反馈说明「路径已复制」。
- 菜单项与反馈文案不展示路径本身，路径只进剪贴板（不违背「界面文案不出现内部标识」）。
- 路径指向持续更新的记录本身，不是导出快照；运行中的对话同样可以复制；同一段对话的路径稳定不变。
- 复制失败时给出可理解说明且剪贴板不被写入。
- 路径来源消费前置 change 提供的 `sessionId → 记录文件路径` 内部查询能力，经桌面主进程（IPC/受控接口）取得，renderer 不自行拼路径。

## 影响

受影响模块：

- `packages/console-ui/src/console/conversation-sidebar.tsx` —— 对话菜单增加第二个菜单项与成功/失败反馈。
- `desktop/src/preload.ts` / `desktop/src/main.ts` / `desktop/src/console-page/` —— 剪贴板写入与路径查询的进程边界透传（路径不落入 renderer 可展示状态）。
- `src/local-console/server.ts` 或桌面 IPC —— 会话记录路径的受控查询端点（仅此用途，不进入列表/详情 DTO）。

对外行为：对话菜单出现新菜单项；剪贴板获得记录文件绝对路径；界面任何位置不显示该路径。

保持不变：对话菜单的其余构成（「归档」）；项目菜单不混入对话操作；侧边栏其余行为；既有 DTO 不新增路径字段。
