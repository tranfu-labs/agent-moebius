# console-ui 规格增量：Codex 一比一操作台

## 新增要求

### Requirement: Codex-native operator-console frame

The operator console MUST use a Codex-desktop-style two-column frame consisting of an integrated project/session rail and a single conversation canvas with a bottom composer.

The default conversation surface MUST NOT render a session header toolbar, aggregate passed/running/waiting counters, a persistent diagnostics button, a persistent worktree toggle, or expandable raw machine data.

The conversation rail MUST render all sessions as a flat peer list even when persisted session summaries contain `parentSessionId`; runtime lineage MUST NOT produce indentation, tree connectors, expand/collapse controls, or parent breadcrumbs in the primary console.

The operator console MUST preserve session selection, local child-session persistence, corrupt-parent boundedness, and current-session restoration while using the flat list.

#### Scenario: Empty session matches the Codex frame

- **GIVEN** the selected session has no messages or active run
- **WHEN** the operator console renders
- **THEN** the rail remains visible, the canvas shows a concise project invitation, and the composer stays near the bottom of the canvas
- **AND** no session toolbar or aggregate counters are shown.

#### Scenario: Lineage does not create a tree

- **GIVEN** root and derived sessions have persisted parent session ids
- **WHEN** the project rail renders
- **THEN** every session appears once with the same row indentation and selection model
- **AND** the primary console shows no parent breadcrumb, tree connector, or expand/collapse control.

### Requirement: Single-stream multi-agent conversation

The conversation canvas MUST render user, agent, and system records in one chronological stream.

Agent identity MUST be expressed through a compact role avatar, localized role name, and inline state metadata rather than separate agent columns or floating message cards.

Active runs, waiting-for-human facts, failures, stuck results, and interruptions MUST remain in the chronological stream and MUST keep their existing interrupt or diagnostic actions.

#### Scenario: Multiple agents share one stream

- **GIVEN** a session contains replies from product-manager, dev, and qa
- **WHEN** the timeline renders
- **THEN** those replies appear in timestamp order in the same canvas with distinct localized role identities
- **AND** no per-agent panel or dashboard is created.

### Requirement: Composer context owns workspace selection

The bottom composer MUST display the current project, workspace mode, and branch/workspace context in a compact context row matching the Codex composer location.

When workspace-mode mutation is available, the workspace context item MUST expose the existing direct/worktree choice without changing runtime workspace semantics.

Raw project paths, SQLite paths, session ids, run ids, run directories, working directories, machine output, and workspace-unavailable diagnostics MUST NOT be visible on the default conversation surface.

Machine details MUST remain accessible through the auxiliary developer diagnostics path or a contextual log action for failures.

#### Scenario: Workspace changes without a persistent rail toggle

- **GIVEN** a project supports worktree mode
- **WHEN** the user uses the workspace item in the composer context row
- **THEN** the existing project workspace mutation callback receives the new mode
- **AND** the rail has no persistent worktree button.

#### Scenario: Machine details stay out of conversation

- **GIVEN** a run snapshot contains cwd, runDir, workspace mode, raw output, and diagnostics
- **WHEN** the default console renders
- **THEN** none of those machine values are visible in the rail, canvas, or composer
- **AND** a readable failure summary may offer a log or developer-diagnostics action.
