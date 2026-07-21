# console-ui delta：main-conversation-new-page

本 delta 只登记足以让机器判定「是否符合」的行为规则；产品意图与视觉细节以 `docs/product/pages/main-conversation.md` 为唯一事实源。

## 修改行为规则

### Requirement: Project-scoped new sessions and empty-session project switching

Source: docs/product/pages/main-conversation.md#入口与去向

原 Requirement 中「MUST NOT retain a global new-session entry whose project ownership is ambiguous」被以下规则替换。项目归属不再需要在入口处消歧，因为进入新对话页不创建任何会话，归属在发出第一条消息时才形成。

- MUST provide an application-level new-conversation entry that opens the new conversation page with no project selected.
- MUST keep the project-row new-session entry, which opens the same page with that row's project already selected.
- MUST NOT preselect any project when the application-level entry is used, including the first opened project or the last used project.
- MUST render the sidebar's application-level new-conversation entry in a selected state while the new conversation page is shown, and MUST NOT add any row to the project list.
- 对已选中且没有消息、运行、父子关系的会话，composer 的项目上下文仍 MUST 提供可改绑的项目菜单（原规则保留）。

#### Scenario: Top entry does not guess a project

- **GIVEN** at least one project is opened
- **WHEN** the user activates the application-level new-conversation entry
- **THEN** the new conversation page shows no selected project
- **AND** the project list gains no new row.

#### Scenario: Project row carries its project

- **GIVEN** the user activates the new-session entry on a project row
- **WHEN** the new conversation page opens
- **THEN** that row's project is selected
- **AND** the page is the same page reached from the application-level entry.

### Requirement: Selection mutation serialization

Source: docs/product/pages/main-conversation.md#操作与反馈

原 Requirement 的 gate 语义不变；下列规则替换其中与 create session 相关的部分。

- The create-conversation mutation MUST create the session and persist its first message within a single mutation token, and MUST commit the resulting selection before releasing the token.
- MUST prevent duplicate submission while the create-conversation mutation is pending.
- On creation failure the console MUST preserve every entered value—draft text, selected project, selected team—and MUST surface a reason that contains no machine identifiers, paths, or internal ids.

#### Scenario: A failed creation loses nothing

- **GIVEN** the new conversation page holds a draft, a selected project, and a selected team
- **WHEN** creation fails
- **THEN** all three remain as entered
- **AND** a human-readable reason is shown.

## 新增行为规则

### Requirement: New conversation page without a persisted session

Source: docs/product/pages/main-conversation.md#页面目标

- MUST render the new-conversation experience as a state of the main content area, and MUST NOT render it as a modal dialog or a separate window.
- MUST NOT create, persist, or select any session when the new conversation page is opened, left, or closed.
- MUST create the conversation only as part of sending the first message.
- MUST show the page title as 新对话 until the first message is sent, after which the title MUST be derived from that message and MUST NOT change with later conversation content.
- MUST truncate a long title to a single line and MUST reveal the full title on hover.
- MUST NOT provide an entry point for editing the conversation title (PRD 本版对是否允许改标题明确不作答).
- MUST hide the workspace and branch context while no project is selected, and MUST keep the draft input and the team selector usable in that state.

#### Scenario: Opening and leaving leaves no trace

- **GIVEN** the new conversation page is open with a draft typed
- **WHEN** the user switches to an existing conversation without sending
- **THEN** no session was created
- **AND** the sidebar gained no row.

#### Scenario: The first message creates the conversation

- **GIVEN** the new conversation page has a selected project and draft text
- **WHEN** the user sends
- **THEN** a conversation appears in the sidebar and becomes selected
- **AND** its title is derived from the sent message.

### Requirement: Send disabled reason is stated inline

Source: docs/product/pages/main-conversation.md#页面状态

- MUST disable sending while no project is selected, and MUST keep draft input available.
- MUST state the reason sending is unavailable as persistent text adjacent to the composer, and MUST NOT convey it only through a hover affordance or the disabled control's own styling.

#### Scenario: The user is told why sending is off

- **GIVEN** the new conversation page has no project selected
- **WHEN** the page renders
- **THEN** the send action is disabled
- **AND** the reason is readable without hovering any control.

### Requirement: Add project from the composer project menu

Source: docs/product/pages/main-conversation.md#操作与反馈

- The composer project menu MUST list every available project and MUST end with an add-project entry.
- A successfully added project MUST become this conversation's project immediately.
- A cancelled or failed add MUST NOT create a project, MUST NOT change the current selection, and MUST preserve every other input on the page.
- When the chosen folder is already bound to an active project, the console MUST NOT add a duplicate and MUST state that the folder is already in use.

#### Scenario: Adding a project from an empty state

- **GIVEN** no project is opened
- **WHEN** the user adds a project from the composer project menu
- **THEN** that project becomes this conversation's project
- **AND** sending becomes available.

#### Scenario: Cancelling the folder picker changes nothing

- **GIVEN** the new conversation page holds a draft and a selected team
- **WHEN** the user opens the folder picker and cancels
- **THEN** no project is created
- **AND** the draft and team selection are unchanged.

### Requirement: Unsent drafts survive restart

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST persist the unsent draft of the new conversation page and of each existing conversation across conversation switches, page switches, window resizes, and application restarts.
- MUST keep the new conversation page's draft separate from every conversation's draft.
- MUST clear the new conversation page's draft only after the conversation has been created and its selection committed.

#### Scenario: A draft outlives a restart

- **GIVEN** the new conversation page holds an unsent draft
- **WHEN** the application is restarted and the new conversation page is opened
- **THEN** the draft is still present.
