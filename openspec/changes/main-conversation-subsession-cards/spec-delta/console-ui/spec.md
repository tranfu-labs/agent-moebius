# console-ui delta：main-conversation-subsession-cards

本 delta 只登记足以让机器判定「是否符合」的行为规则；产品意图与视觉细节以 `docs/product/pages/main-conversation.md` 为唯一事实源。

## 修改行为规则

### Requirement: Flat session rail with persisted lineage

Source: docs/product/pages/main-conversation.md#区域与信息

原 Requirement 的「MUST keep parent and child sessions flat at the same indentation within their project; child sessions MUST expose an accessible label indicating the parent session」被以下规则替换。子任务是团队的内部产物，不是用户主动管理的对象；让它们进入侧边栏会使侧栏长度随团队的拆分行为膨胀。

- MUST NOT render sessions that have a parent session in the sidebar rail.
- MUST NOT render a lineage label in the sidebar, since no child session appears there.
- MUST keep `parent_session_id` and session edges serving runtime orchestration and recovery only; removing child sessions from the rail MUST NOT change that persistence.
- 其余原规则（同项目内按创建时间倒序、状态变化不改变顺序、无「已完成」分组、归档需显式动作）保持不变。

#### Scenario: Splitting a goal does not grow the sidebar

- **GIVEN** a conversation whose team splits the goal into three sub-tasks
- **WHEN** the sidebar renders that project
- **THEN** only the parent conversation appears
- **AND** no row is added for any sub-task.

### Requirement: Sidebar width and narrow-window auto-collapse

Source: docs/product/pages/main-conversation.md#响应式与窗口行为

原 Requirement 保持；补充会话页上下文条的窄窗行为。

- MUST collapse the conversation context entries progressively as the window narrows, in the order 分支 → 工作空间 → 团队 → 项目.
- MUST keep 项目 and 团队 as the last two to collapse.

#### Scenario: Branch yields first

- **GIVEN** the conversation context shows all four entries
- **WHEN** the window narrows by one step
- **THEN** the branch entry is the first to be dropped.

## 新增行为规则

### Requirement: Sub-session card in the timeline

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST render a card in the parent conversation's timeline when the team splits the goal into sub-tasks.
- MUST place the card as a chronological record following the message that triggered the split, and MUST NOT float it outside the timeline.
- MUST render each row with three facts: the sub-task, the responsible member, and that sub-task's current status.
- MUST render the status on every row. The rule「能被对话内容本身表达的不给状态标记」MUST NOT be applied here: the sub-session's content is not on the main timeline, so the main timeline cannot express it, and the card is the only aggregate entry point.
- MUST take the status from the runtime's aggregate, and MUST NOT derive it in the presentation layer.
- MUST keep the card's position stable across an application restart.

#### Scenario: The card says how many are done without opening any of them

- **GIVEN** a split produced three sub-tasks in different states
- **WHEN** the card renders
- **THEN** each row shows its sub-task, member, and current status
- **AND** the user can tell which one did not run without opening it.

### Requirement: Sub-session panel shell

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST open the corresponding sub-session in a panel on the right when a card row is activated.
- MUST keep the parent conversation visible alongside the panel in wide windows, and MUST mark the opened row on the card.
- MUST cover the entire main content area with the panel in narrow windows.
- MUST restore the parent conversation's prior scroll position when the panel closes, including when new messages arrived in the parent while the panel was open.
- MUST NOT define the panel's internal structure, input method, or actions in this domain; the panel content is governed by that area's own requirement, which does not yet exist.

#### Scenario: Closing returns the user where they were

- **GIVEN** the user opened a sub-session from a card partway up the parent timeline
- **WHEN** the panel is closed
- **THEN** the parent conversation is shown at the same scroll position as before
- **AND** this holds even if new messages arrived while the panel was open.
