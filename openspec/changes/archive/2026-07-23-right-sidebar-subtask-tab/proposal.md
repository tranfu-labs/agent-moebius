# 提案：right-sidebar-subtask-tab

## 需求基线

产品事实源锚点：`docs/product/pages/main-right-sidebar.md`。本 change 交付右侧栏的**子任务标签**——查看单个子任务并推进它的对话。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-right-sidebar.md` | 区域与信息 · 子任务标签 | 名称 / 成员 / 状态 + 推进内容、说话方式与主对话区一致、唯一提供推进操作处、不提供改动视图 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 操作与反馈 · 关闭标签 | 关子任务标签不取消子任务、对应子会话卡片标记为正在查看 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 弹层与危险操作 | 子任务标签是唯一例外：承载对话推进（输入 / 提及 / 重试 / 停下），仍不改文件 | 已写入 |

## 背景

`main-conversation-subsession-cards`（已落 main）提供了子会话卡片与打开链路：点子会话卡片某行 → `openSubSession()` → `GET /api/local-console/sessions/:id/view` → `OperatorSubSessionView {session, messages, activeRun}` → 渲染进 `sub-session-panel.tsx`（当前是单面板、**只读**、无输入框）。`child-session-summary.ts` 已能派生子任务名 / 负责成员 / 状态。`main-conversation-evidence-outlets` 又把 `sub-session-panel.tsx` 复用为证据单视图的降级壳。

`right-sidebar-shell` 用多标签容器整体替换了这个降级壳，并给子任务内容标签留了占位槽。本片把子任务从「单只读面板」升级为「右侧栏里的一个可推进标签」——这是 PRD 里右侧栏**唯一**提供推进操作的地方（主对话区的子会话卡片只给状态、不给操作入口，子任务在别处没有说话的地方）。

## 提案

把子任务标签做成「小一号的对话」：查看 + 推进，说话方式与主对话区一致。

1. **子任务标签内容**：显示子任务名称、负责成员、当前状态（复用 `child-session-summary.ts`），以及它自己的推进内容（`OperatorSubSessionView` 的 messages / activeRun）。多个子任务可各占一个标签。
2. **说话方式与主对话区一致**：子任务标签内嵌与主对话区**同一套** composer（输入框 + `@` 提及成员 + 中断正在工作的成员），而非另学一套规矩。当前 `sub-session-panel.tsx` 只读渲染消息、无输入框——本片补上。
3. **推进操作在标签内直接可用**：重试、停下与主对话区一一对应，接主对话区已有的 `onRetry` / `onStop` / `interrupt` 能力。这是本页唯一提供推进操作的地方。
4. **正在查看的联动**：子任务标签打开后，主对话区对应子会话卡片行标记为「当前正在查看」（复用 `sub-session-card.tsx` 的 `openedSessionId` 高亮）。
5. **边界**：子任务标签**不提供改动视图**（子任务改的文件算进这段对话的改动，去改动标签看）；关闭子任务标签**只关视图、不取消子任务**，且要让用户看得出来；不承载子会话管理（不在此新建 / 重命名 / 删除子任务）。除对话推进外仍**不改变任何文件**。

## 影响

受影响模块：

- `packages/console-ui/src/console/subtask-tab.tsx`（新增，或由 `sub-session-panel.tsx` 演进）：子任务标签——头部（名 / 成员 / 状态）+ 推进内容 + 内嵌 composer + 推进操作，替换 `right-sidebar-shell` 的子任务占位槽。
- `packages/console-ui/src/console/sub-session-panel.tsx`：从「单只读面板 / 证据降级壳」退役为子任务标签的内容，或被 `subtask-tab.tsx` 取代；保持 `onClose` 纯关闭语义（不触 interrupt）。
- `packages/console-ui/src/console/operator-console.tsx`：子任务意图落成子任务标签；把主对话区的 composer / `onRetry` / `onStop` / `onMention` 接进子任务标签；`openedSubSessionId` 联动子会话卡片高亮。
- 复用现有 composer：`role-composer.tsx` / `agent-markdown-mention-editor.tsx` / `composer-context.tsx`。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`、`interrupt.ts`：接通子任务的说话 / 提及 / 重试 / 停下到对应子会话。
- 相关共置测试 + `desktop/tests/` 接线测试（从最外层入口驱动推进，验证接的是对应子会话而非主会话）。

对外行为：从主对话区子会话卡片打开子任务标签，看到该子任务的名 / 成员 / 状态 + 推进内容，可在标签内说话、`@` 提及、重试、停下；打开时对应卡片行显示正在查看；关标签不取消子任务；子任务标签内没有改动视图，也没有改文件的动作。

**明确不做**：不碰改动 / 项目文件 / 过程标签、右侧栏容器骨架。不改子会话数据模型（复用现有）。不在右侧栏创建 / 重命名 / 删除子任务。不提供改动视图与任何文件写操作。
