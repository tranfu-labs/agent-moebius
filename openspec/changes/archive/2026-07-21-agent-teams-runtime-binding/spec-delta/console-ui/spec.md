# console-ui delta：agent-teams-runtime-binding

## ADDED Requirements

### Requirement: Conversation view routing

Source: docs/product/pages/main-sidebar.md#选择对话

- MUST return the main area to the conversation view whenever an action takes the user to a specific conversation, including selecting a session in the sidebar, successfully creating a conversation, jumping from a search result, and switching sessions as a consequence of archiving or removing a project.
- MUST route those actions through a single entry point that performs the session switch and the view return together.
- MUST NOT leave the sidebar selection on one conversation while the main area shows the agent teams page.
- MUST prompt for unsaved team drafts before leaving the agent teams page through that entry point, using the existing save/discard/cancel choices.

#### Scenario: Selecting a conversation leaves the teams page

- **GIVEN** the main area shows the agent teams page
- **WHEN** the user clicks a conversation in the sidebar
- **THEN** the main area shows that conversation's timeline
- **AND** the sidebar selection and the main area refer to the same conversation.

#### Scenario: Unsaved drafts are not lost on the way out

- **GIVEN** the agent teams page holds an unsaved `AGENT.md` draft
- **WHEN** the user clicks a conversation in the sidebar
- **THEN** the save, discard, and cancel choices are offered before the view changes.

### Requirement: Team browsing is separate from the conversation's team

Source: docs/product/pages/agent-teams.md#团队位置不可用

- MUST derive the conversation's current team from the session's own binding.
- MUST keep the team selected for browsing on the agent teams page independent of that binding.
- MUST base send availability, and any team indicator shown with the conversation, on the bound team only.
- MUST NOT let a conversation default to an arbitrary team when its session has no binding.
- MUST re-evaluate the bound team's health on the existing refresh cycle, so a team that becomes unavailable or is repaired outside the app takes effect without visiting the agent teams page.

#### Scenario: Browsing a broken team does not block conversations

- **GIVEN** a conversation is bound to a healthy team
- **WHEN** the user opens a team that needs repair on the agent teams page and returns to the conversation
- **THEN** sending in that conversation remains available.

#### Scenario: The conversation's own team governs sending

- **GIVEN** a conversation is bound to a team that needs repair
- **WHEN** the conversation is shown
- **THEN** its history remains viewable and sending is blocked
- **AND** the block persists regardless of which team is selected on the agent teams page.

#### Scenario: Repairing outside the app takes effect without a visit

- **GIVEN** sending is blocked because the bound team's directory was moved outside the app
- **WHEN** the directory is restored and the user stays in the conversation
- **THEN** sending becomes available on a subsequent refresh
- **AND** the user does not have to open the agent teams page to retry.

### Requirement: Composition-safe agent markdown editing

Source: docs/product/pages/agent-teams.md#编辑与保存 `AGENT.md`

- MUST NOT rewrite the editor's content or reset the caret while an input method composition is in progress.
- MUST commit the composed text once, after the composition ends.
- MUST verify this through tests that drive the real input path, and MUST NOT assert it by assigning element text directly.

#### Scenario: Composing text is not interrupted

- **GIVEN** the user is composing text with an input method in the `AGENT.md` editor
- **WHEN** intermediate composition updates occur
- **THEN** the composition continues uninterrupted
- **AND** the caret stays where the user was typing.

## MODIFIED Requirements

### Requirement: Needs-repair propagation to the sidebar entry

Source: docs/product/pages/agent-teams.md#团队横行

- MUST show a single indicator on the sidebar "Agent 团队" entry whenever at least one team needs repair.
- MUST NOT scale that indicator with the number of affected teams.
- MUST expose the accessible name and hover text `有 Agent 团队需要修复` so the meaning does not depend on color alone.
- MUST NOT show the indicator for unfinished drafts.
- MUST mark the specific affected teams on the team list when the user opens the page from that entry.
- MUST keep an existing conversation's history viewable when **the team bound to that conversation** needs repair, and MUST block sending new messages in that conversation.
- MUST show a placeholder in place of the member row for a team that needs repair, and MUST NOT show member names or a member count for it.

#### Scenario: Multiple broken teams show one indicator

- **GIVEN** three teams need repair
- **WHEN** the sidebar renders
- **THEN** exactly one indicator appears on the "Agent 团队" entry with no count
- **AND** opening the page marks all three affected rows as needing repair.

#### Scenario: Broken team row identifies the team without a roster

- **GIVEN** a team needs repair because its directory is unreadable
- **WHEN** its row renders on the team list
- **THEN** the team name, description, and reason are shown
- **AND** the member area shows a placeholder instead of member names or a count.

### Requirement: External modification conflict resolution

Source: docs/product/pages/agent-teams.md#外部修改冲突

- MUST apply conflict handling only to user teams.
- MUST reload an externally updated `AGENT.md` and show a light notice when the app holds no unsaved content for that member.
- MUST keep the draft and notify that the file changed externally when the app holds an unsaved draft for that member.
- MUST offer exactly two resolutions: load the external version, or overwrite with the current content.
- MUST NOT silently pick either side.
- MUST NOT provide line-level diff or automatic merge.
- MUST NOT trigger a conflict prompt for external changes to files other than the members' `AGENT.md`.
- MUST explain which members still need a resolution when leaving the team is refused, and MUST NOT let the leave control appear operable while doing nothing.
- MUST report a failed external-change check to the user on the affected member, rather than discarding it.

#### Scenario: Draft is never silently overwritten

- **GIVEN** a member has an unsaved draft in the app
- **WHEN** the same member's `AGENT.md` is modified outside the app and the user returns to the app
- **THEN** the draft is preserved
- **AND** the user is asked to choose between loading the external version and overwriting with the current content.

#### Scenario: Refused leave says why

- **GIVEN** a member has an unresolved external conflict
- **WHEN** the user attempts to return to the team list
- **THEN** the view stays on the team detail
- **AND** an explanation names the members awaiting a resolution.
