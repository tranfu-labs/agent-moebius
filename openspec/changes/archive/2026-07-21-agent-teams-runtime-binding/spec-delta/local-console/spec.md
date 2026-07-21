# local-console delta：agent-teams-runtime-binding

## ADDED Requirements

### Requirement: Session agent team binding

Source: docs/product/pages/agent-teams.md#新建对话中的团队预选

- MUST persist, on each local session, the ownership and id of the agent team chosen when that conversation was created.
- MUST write the binding as part of creating the session, so a created session is never left unbound by a later failing step.
- MUST treat an absent binding as "use the shared agent directory", and MUST keep sessions created before this change working unchanged.
- MUST NOT derive a session's team from any global preference record; the last-used-team record only preselects a team for the next new conversation.
- MUST NOT change a session's binding as a side effect of browsing or editing teams.

#### Scenario: Created session carries its team

- **GIVEN** the user creates a conversation with a chosen team
- **WHEN** the session is persisted
- **THEN** the session records that team's ownership and id
- **AND** reopening the session later reports the same team.

#### Scenario: Sessions created before this change keep working

- **GIVEN** a session persisted before team binding existed
- **WHEN** the user sends a message in it
- **THEN** the run proceeds using the shared agent directory
- **AND** no error is raised for the missing binding.

### Requirement: Session-scoped agent roster

Source: docs/product/pages/agent-teams.md#团队位置不可用

- MUST resolve the agents available to a run from the session being run, not from a process-wide directory listing.
- MUST use the resolved set both for dispatching a mention to a role and for reporting which roles are available.
- MUST surface an explicit failure when the roster cannot be resolved, and MUST NOT substitute the shared directory for a session whose bound team is unavailable.

#### Scenario: Mention outside the bound team does not silently resolve

- **GIVEN** a session bound to a team that does not include a given role
- **WHEN** a message mentions that role
- **THEN** the run reports that the role is not available to this conversation
- **AND** no agent from the shared directory is used in its place.
