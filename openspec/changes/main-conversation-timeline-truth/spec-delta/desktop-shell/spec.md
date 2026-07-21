# desktop-shell delta：main-conversation-timeline-truth

## 修改业务规则

### Session-scoped agent roster injection

Source: docs/product/pages/main-conversation.md#现状参考与产品缺口

原规则「MUST fall back to the shared `<dataRoot>/agents/` directory when the session has no bound team」被以下规则替换。Agent 只来自团队，没有脱离团队的全局来源。

- MUST NOT fall back to the shared `<dataRoot>/agents/` directory for any session.
- MUST fail with an explicit error, rather than an empty roster or a shared-directory substitute, when the bound team is unavailable.
- MUST distinguish 团队已删除 from 团队需要修复 in that error, so the console can offer the right recovery action.
- 其余原规则（注入名单解析器、按记录的团队位置解析成员、不把 `teams/` 布局知识搬进 local console server）保持不变。

#### Scenario: No session falls back to the shared directory

- **GIVEN** a session whose bound team cannot be resolved
- **WHEN** the runtime resolves the agents available to that session
- **THEN** an explicit error is raised
- **AND** no agent from the shared `agents/` directory is used.

#### Scenario: Deleted and broken teams are told apart

- **GIVEN** one session bound to a team that no longer exists and another bound to a team whose directory is unreadable
- **WHEN** the runtime resolves each roster
- **THEN** the two failures are distinguishable
- **AND** the console can offer reselection for the former and repair for the latter.
