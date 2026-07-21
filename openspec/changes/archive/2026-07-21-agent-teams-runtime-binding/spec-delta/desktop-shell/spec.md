# desktop-shell delta：agent-teams-runtime-binding

## ADDED Requirements

### Requirement: Team record location independent of team id

Source: docs/product/pages/agent-teams.md#团队位置不可用

- MUST record a user team's on-disk location as a value distinguishable between a managed directory under `<dataRoot>/teams/` and an arbitrary absolute path outside it.
- MUST keep the team id stable across relocation, and MUST NOT derive a user team's directory from its id.
- MUST resolve every user-team path — member reads and writes, file-manager reveal, and external-change detection — through the recorded location.
- MUST continue resolving built-in teams by id under `.system/`, since built-in teams cannot be relocated.
- MUST read records written by the previous document version as managed directories, without user intervention.
- MUST NOT cache member display names or descriptions in the team record, including for the needs-repair state.
- MUST retain the team name and one-line description in the record so a team whose directory is unavailable remains identifiable.

#### Scenario: Relocated team stays reachable

- **GIVEN** a user team has been relocated to a directory outside `<dataRoot>/teams/`
- **WHEN** the user reveals that team in the file manager, and the app checks one of its members for external modification
- **THEN** both operations resolve to the relocated directory
- **AND** neither falls back to a path derived from the team id.

#### Scenario: Records from the previous version keep working

- **GIVEN** a team record was written before this change and stores only a directory name
- **WHEN** the app loads team records
- **THEN** the record resolves to that directory under `<dataRoot>/teams/`
- **AND** the team's id, name, and description are unchanged.

#### Scenario: Unavailable team is identifiable without a cached roster

- **GIVEN** a recorded user team whose directory is unreadable
- **WHEN** the team list renders that team
- **THEN** its name and description come from the record
- **AND** no member name or member count is shown.

### Requirement: Session-scoped agent roster injection

Source: docs/product/pages/agent-teams.md#团队位置不可用

- MUST inject, when starting the local console server, a roster resolver that answers with the agent set applicable to a given session.
- MUST resolve that set from the members of the team bound to the session, using the recorded team location.
- MUST fall back to the shared `<dataRoot>/agents/` directory when the session has no bound team.
- MUST fail with an explicit error, rather than an empty roster, when the bound team needs repair.
- MUST NOT move knowledge of the `teams/` layout into the local console server itself.

#### Scenario: Bound session sees only its team

- **GIVEN** a session is bound to a team with three members
- **WHEN** the runtime resolves the agents available to that session
- **THEN** the result is exactly those three members
- **AND** agents present only in the shared `agents/` directory are absent.

#### Scenario: Broken team is reported, not silently empty

- **GIVEN** a session is bound to a team that needs repair
- **WHEN** the runtime resolves the agents available to that session
- **THEN** an explicit error identifies the team as needing repair
- **AND** the failure is not presented as the session having no agents.
