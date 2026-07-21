# 提案：main-conversation-new-page

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md`。本次为**实现缺口**——PRD 已写清楚，实现没做到，因此不改 PRD 内容。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 页面结构 / 区域与信息 · 页面标题 / 操作与反馈 · 创建一段对话 / 选择项目与添加项目 / 区域与信息 · 输入框 | 无内容变更；本 change 兑现既有条文 | 已写入 |
| `docs/wireframes/pages/console.md` | 全文 | 顶部加接管声明：主内容区事实已由 `main-conversation.md` 承接 | 已写入 |
| `docs/product/pages/new-conversation.md` | 全文 | 顶部加取代声明：新建对话与会话页是同一个页面 | 已写入 |

PRD「待讨论」中与本片相邻的一项——**是否允许用户修改对话标题**（自动取第一句开头文字在真实使用中可能高度雷同）——本版明确不作答，实现不提供修改入口，也不自行发明消歧规则。

## 背景

PRD 的立场是：「新建对话」不是一个动作，而是会话页还没有任何消息时的样子。产品不设独立的新建对话窗口。

当前实现与此直接相反：

1. `packages/console-ui/src/console/operator-console.tsx` 的 `NewConversationDialog` 是一个**模态对话框**，由 `setApplicationOverlay({kind:"new-conversation"})` 唤起。
2. 它**总是预选** `availableProjects[0]`，包括从侧边栏顶部进入时。PRD 明确要求顶部进入不预选项目——「替用户猜一个会让一次没看清的点击变成一段归属错误且无法纠正的对话」。
3. 提交时立刻 `POST /api/local-console/sessions`，标题硬编码为「新会话」。**会话在第一条消息之前就已落盘**，用户点开又退出会留下空白对话。
4. `normalizeTitle` 只做规整，没有任何路径把标题设为首条消息的开头文字；仓库里只有 `renameProject`，没有 rename-session。
5. 「添加项目」只在 `availableProjects.length === 0` 时作为弹窗空态兜底出现，侧边栏与项目按钮里都没有入口。
6. 未发送的草稿只活在 renderer 内存里，重启即丢。PRD 要求它跨重启保留——「描述目标是用户在这个产品里花时间最多的动作」。

## 提案

把「新建对话」从模态弹窗改造成主内容区的一种页面状态，并把会话的诞生时刻从「点新建」推迟到「发出第一条消息」。

1. 新增 `packages/console-ui/src/console/new-conversation-page.tsx` 承载新对话页的展示（引导语 + 上下文按钮 + composer），删除 `NewConversationDialog`。主内容区按有无选中会话在会话视图与新对话页之间切换。
2. 新增 `desktop/src/console-page/draft-store.ts`，草稿落 renderer 本地存储，按 `draft:new` 与 `draft:<sessionId>` 两种 key 隔离。不新增 SQLite 表——新对话尚不存在会话主体，为它在数据库里造一张表会引入「草稿何时清理」的新问题。
3. `desktop/src/console-page/new-conversation.ts` 从「调用 createSession」改造成新对话页的草稿状态机：项目与团队选择、草稿文本、能否发送、提交。这是把这块逻辑从 1351 行的 `app.tsx` 里摘出来的落点。
4. `state-sync.ts` 的 `createSession` 改为 `createSessionWithFirstMessage`，在同一个 selection mutation token 内完成建会话、落首条消息、提交选中态。
5. `POST /api/local-console/sessions` 接受可选 `initialMessage`；runtime 在同一事务内建会话并落首条消息，标题由新增的纯函数 `src/local-console/title.ts` 从消息体导出。
6. 项目按钮下拉末尾加「添加项目…」，复用现成的 `onOpenProject` 链路（IPC `project:select-folder` → `POST /projects`）。

## 影响

受影响模块：

- `packages/console-ui/src/console/operator-console.tsx`：删除 `NewConversationDialog`；主区视图切换；项目下拉加「添加项目…」。
- `packages/console-ui/src/console/new-conversation-page.tsx`：新增，含共置测试与 Story。
- `desktop/src/console-page/new-conversation.ts`：改造为草稿状态机。
- `desktop/src/console-page/draft-store.ts`：新增。
- `desktop/src/console-page/state-sync.ts`：`createSession` → `createSessionWithFirstMessage`。
- `desktop/src/console-page/app.tsx`：新对话页相关状态迁出。
- `src/local-console/server.ts`、`runtime.ts`：`POST /sessions` 接受 `initialMessage`。
- `src/local-console/title.ts`：新增。
- `docs/wireframes/pages/console.md`、`docs/product/pages/new-conversation.md`：加接管 / 取代声明，不删历史内容。

对外行为：

- 从侧边栏顶部进入不再创建任何会话，也不预选项目；点开又退出不留下空白对话。
- 会话标题不再是「新会话」，而是第一条消息的开头文字，发出后不再变化。
- 未发送的草稿跨切换、跨页面、跨重启保留。

不受影响：GitHub runner、子会话编排的创建路径（不带 `initialMessage` 时行为不变）、goal-ledger、Codex driver。

## 验收语句

对应 `docs/product/pages/main-conversation.md`「验收标准」#1 #2 #3 #4 #5（项目锁定部分）#19：

1. 从侧边栏顶部进入新对话页时不创建任何对话，且项目为未选定状态；退出后侧边栏不新增行，也不留下空白对话。
2. 从项目行进入时该项目已被选中，且与顶部进入是同一个页面。
3. 发出第一条消息后对话才被创建，侧边栏出现对应行并选中，标题取自该条消息的开头文字。
4. 项目未选定或一个项目都没有时，草稿可以输入、团队可以改选，但发送被禁用；从项目按钮可以添加项目并直接用于本次对话。
5. 项目在发出第一条消息后锁定为不可点击文本。
6. 未发送的草稿在切换对话、切换页面和重启应用后仍然保留。
