# 提案：main-conversation-workspace-lock

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md`。本次**没有新的产品决策**——立场变更已由 `461fa7a` 在建立 `docs/product/pages/main-right-sidebar.md` 时写入 PRD，本 change 只是让实现追上它。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 操作与反馈 · 选择工作空间与团队 | 「工作空间和团队都可以在对话进行中改变」改为「工作空间只能在发出第一条消息之前选择，之后与项目一同锁定」 | 已写入（`461fa7a`） |
| `docs/product/pages/main-conversation.md` | 页面结构 · 选择独立工作空间的说明 | 原「工作空间切换确认」双向确认改为单向说明；明确「对话开始后工作空间锁定，没有切回默认工作空间这条路径，也不存在对应的确认弹层」 | 已写入（`461fa7a`） |
| `docs/product/pages/main-conversation.md` | 验收标准 #5 | 「工作空间和团队在对话进行中仍可改变」改为「项目与工作空间在发出第一条消息后一同锁定；团队在对话进行中仍可切换」 | 已写入（`461fa7a`） |

**为什么反转**（理由记录在 PRD 与 `main-right-sidebar.md` 正文，此处只留指针）：右侧栏以「这段对话开始时的状态」为基线回答「这段对话改了什么」，而这个问题只有在一段对话从头到尾都在同一个地方工作时才有答案。中途换地方，改动会分散在两处，用户唯一想问的问题就变成没法回答的问题。团队不受影响——换人不改变工作现场。

## 背景

`main-conversation-session-context`（B 片）按当时的 PRD 交付了「工作空间在对话进行中可改选」，实现完全符合当时的判据，包括一个「从独立切回默认」的确认弹层——当时的 spec-delta 里它是 MUST。

PRD 随后反转了这条立场，但没有 change 承接。当前实现因此与产品事实源直接冲突，且冲突是**双向**的：

1. **该锁的没锁**。`ComposerContext` 对已有消息的会话仍然渲染可展开的工作空间下拉（`composer-context.tsx:121`）；后端 `switchLocalSessionWorkspace` 也照单全收（`sqlite-state-worker.ts:1252`）。
2. **不该存在的还在**。PRD 明写「没有切回默认工作空间这条路径，也不存在对应的确认弹层」，而 `composer-context.tsx:192` 的确认弹层正是为这条路径而生，文案里还保留着「此前已经在项目文件夹里产生的改动也不会被搬过去」这句只在中途切换语境下才成立的说明。
3. **待生效机制半边失效**。`workspace_pending_mode` 与「当前这一步跑完后换成…」说明行是为运行中切换工作空间设计的；锁定之后这条路径不可达，留着它等于留一条永不执行的分支和一份会误导后续实现的 spec。

这三条合起来使 PRD 验收 #5 不成立，且不是「少做了什么」，是**要拆掉已经做好的东西**。

## 提案

把工作空间对齐为「与项目一同在发出第一条消息后锁定」，并拆除为中途切换而存在的全部机制。

1. `ComposerContext`：会话已有消息时，工作空间与项目一样渲染为不可点击文本；未发消息时保持可选。
2. 删除「换回默认工作空间」分支与整个工作空间确认弹层；独立工作空间的后果说明移到新对话页的选择处（PRD「选择独立工作空间的说明」），只保留单向说明，去掉「既有改动不会被搬过去」这句中途切换才需要的话。
3. 后端 `switchLocalSessionWorkspace` 在会话已有消息时拒绝并返回可理解的原因；`workspace_pending_mode` 的写入路径拆除。
4. `composer-context.tsx` 的待生效说明行只保留团队一路。
5. B 片交付的相关 spec 与测试随行为重写，不留两套语义并存。

## 影响

受影响模块：

- `packages/console-ui/src/console/composer-context.tsx`：工作空间降级为锁定文本；删除确认弹层与切回默认路径；待生效说明行收敛为团队一路。
- `packages/console-ui/src/console/composer-context.test.tsx`、`composer-context.stories.tsx`：断言与 Story 随行为重写。
- `packages/console-ui/src/console/new-conversation-page.tsx`：承接独立工作空间的单向后果说明（当前新对话页只显示 `workspaceLabel`，不提供选择）。
- `packages/console-ui/src/console/operator-console.tsx`：`onChangeSessionWorkspace` 的传递条件收紧到未发消息的会话。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`：移除运行中工作空间切换的乐观态与待生效同步。
- `desktop/src/console-page/new-conversation.ts`：让新对话草稿持有首条消息前选定的工作空间，并把它与项目、团队、首条消息一起提交。
- `desktop/tests/new-conversation.test.ts`、`console-state-sync.test.ts`：从桌面状态机与 HTTP fetch 边界验证工作空间选择随 create request 原子提交。
- `src/sqlite-state-worker.ts`：`switchLocalSessionWorkspace` 增加锁定判据；停止写入 `workspace_pending_mode`；保留列本身以免破坏既有库，但读路径不再产生非空值。
- `src/local-console/runtime.ts`：步骤收尾时的 pending 提升只处理团队。
- `src/local-console/server.ts`、`store.ts`、`types.ts`、`src/sqlite-state.ts`：把首条消息创建时的工作空间与锁定错误贯穿真实 HTTP、runtime 与 SQLite worker 边界。
- `src/local-console/workspace-resolution.ts`：兼容读取存量 `workspace_pending_mode`，但解析结果只采用生效工作空间。
- `tests/local-console-pending-switch.test.ts`：工作空间部分的用例改为「已有消息的会话拒绝切换」，团队部分保留。
- `tests/local-console-workspace-resolution.test.ts`：覆盖存量待生效工作空间不参与运行解析。
- `packages/console-ui/src/console/new-conversation-page.test.tsx`、`new-conversation-page.stories.tsx`、`operator-console.test.tsx`：覆盖新对话选择说明、非 Git 禁用边界与已有消息会话的应用容器锁定接线。

对外行为：

- 已经开始的对话不再能改变工作空间；上下文条第二格是不可点击文本。
- 不再出现工作空间切换确认弹层。
- 团队仍可在对话进行中改选，且仍跑完当前这一步再生效——本片不动这条。

保持不变的核心语义：工作空间仍归属会话而非项目（B 片的核心交付），同一项目下两段对话仍可分别使用默认与独立工作空间；已有会话的存量模式与迁移结果不变。

## 验收语句

对应 `docs/product/pages/main-conversation.md`「验收标准」#5：

1. 项目与工作空间在发出第一条消息后一同锁定为不可点击文本；团队在对话进行中仍可切换。
2. 产品内不存在从独立工作空间切回默认工作空间的路径，也不存在对应的确认弹层。
3. 回归 #7：同一个项目下的两段对话仍可分别使用默认工作空间和独立工作空间，互不影响。
