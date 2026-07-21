# console-ui delta：main-conversation-session-context

## 新增行为规则

### Requirement: Conversation context row shows four facts in fixed order

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST render the conversation context above the composer in the fixed order 项目 → 工作空间 → 分支 → 团队.
- MUST render the branch as the real branch name supplied by the runtime, and MUST NOT render a literal placeholder such as 当前分支 or 会话分支.
- MUST render the branch as read-only.
- MUST hide the workspace and branch entries while no project is selected.
- MUST render the project as read-only text once the conversation has messages, an active run, or a parent/child relationship.

#### Scenario: Branch shows a name the user can act on

- **GIVEN** the conversation's workspace is on branch `feat/x`
- **WHEN** the context row renders
- **THEN** `feat/x` is shown
- **AND** it is not interactive.

### Requirement: Workspace is chosen per conversation

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST present the workspace entry as a menu offering 默认工作空间 and 独立工作空间, and MUST apply the choice to this conversation only.
- MUST disable 独立工作空间 when the project folder is not a git repository, and MUST state the reason inside the menu next to the disabled entry.
- Before switching from 默认工作空间 to 独立工作空间, MUST state both facts: the copy is based on the project's current commit and does not include uncommitted changes, and changes already made in the project folder are not carried over.
- Before switching from 独立工作空间 back to 默认工作空间, MUST state that later changes will land directly in the project folder.
- MUST NOT imply that switching workspaces reverts or cleans up changes already made.

#### Scenario: Non-git folder explains itself where the choice is made

- **GIVEN** the conversation's project folder is not a git repository
- **WHEN** the user opens the workspace menu
- **THEN** 独立工作空间 is not selectable
- **AND** the reason is readable inside the menu without opening anything else.

### Requirement: Team is selectable and discloses its snapshot nature

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST present the team entry as a menu listing selectable teams, and MUST allow changing it while the conversation is in progress.
- MUST state, within that menu, that this conversation uses the team content loaded when it started and that later edits on the agent teams page do not affect it.
- MUST keep the existing conversation and all prior context on switch; the new team takes over subsequent progress.
- MUST NOT present the team entry as a non-interactive label.

#### Scenario: The user can tell why editing the team file changed nothing

- **GIVEN** a conversation bound to a team
- **WHEN** the user opens the team menu
- **THEN** the menu states that this conversation uses the team content loaded when it started.

### Requirement: Pending context switches are visible until they take effect

Source: docs/product/pages/main-conversation.md#操作与反馈

- When a workspace or team switch is pending because a member is working, MUST show the target value on the corresponding entry and MUST state that it takes effect after the current step finishes.
- MUST remove that statement once the switch takes effect.
- MUST NOT present a pending switch as already effective, and MUST NOT present it as failed.

#### Scenario: A pending switch is not mistaken for a no-op

- **GIVEN** a member is working and the user selects a different team
- **WHEN** the context row renders
- **THEN** the new team is shown on the entry
- **AND** a statement says it takes effect after the current step finishes.
