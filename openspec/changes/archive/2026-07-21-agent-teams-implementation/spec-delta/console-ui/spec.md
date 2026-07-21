# console-ui spec delta：agent-teams-implementation

本 delta 只登记那些足以让机器判定「是否符合」的行为规则，产品意图与视觉细节仍以 `docs/product/pages/agent-teams.md` 为唯一事实源。

## 新增行为规则

### Requirement: Team storage layout and write ownership

- MUST store teams under `<dataRoot>/teams/`, where `<dataRoot>` is resolved by the existing `resolveDesktopDataRoot`.
- MUST place built-in teams under the reserved `<dataRoot>/teams/.system/` subtree and user teams as siblings directly under `<dataRoot>/teams/`.
- MUST give built-in and user teams the same on-disk shape: `team.json` plus `members/<slug>/AGENT.md`.
- MUST store only the team name, one-line description, primary agent slug, and member order in `team.json`.
- MUST NOT store member display names or member descriptions anywhere except each member's own `AGENT.md`.
- MUST reject every write request targeting a team under `.system/` at the data layer, independently of whether the UI disabled the corresponding control.
- MUST NOT convert a built-in team into a user team as a result of any external file modification.

#### Scenario: Built-in team write is rejected below the UI

- **GIVEN** a built-in team exists under `<dataRoot>/teams/.system/`
- **WHEN** a write request targeting that team or any of its members reaches the data layer without passing through the UI
- **THEN** the request is rejected with an explicit error
- **AND** no file under `.system/` is modified.

#### Scenario: Member display name has a single source

- **GIVEN** a member's `AGENT.md` declares a display name and a one-line description
- **WHEN** the team list row, the member selector, and the current agent heading render
- **THEN** all three read that same `AGENT.md`
- **AND** no separate cached member summary can drift from it.

### Requirement: Built-in team seeding by content fingerprint

- MUST package the repository's `seeds/teams/` directory into the installer as `seed/teams`.
- MUST compare the content fingerprint of `seed/teams` against `<dataRoot>/teams/.system/.teams-seed.marker` on startup.
- MUST replace the entire `.system/` subtree when the fingerprint does not match, and MUST skip seeding entirely when it matches.
- MUST perform the replacement by unpacking to a temporary location and then swapping atomically, and MUST write the marker file only after the swap succeeds.
- MUST NOT read, write, move, or delete anything outside `.system/` during seeding.
- MUST NOT apply the existing `buildSeedCopyPlan` skip-if-destination-exists rule to built-in teams; that rule MUST remain unchanged for `agents/` and `config.toml`.
- MUST keep the previously seeded `.system/` subtree usable when seeding fails, rather than leaving it emptied.

#### Scenario: Upgrade delivers improved built-in teams

- **GIVEN** a user installed an earlier version and its built-in teams were seeded
- **WHEN** the user upgrades to a version whose `seed/teams` content differs
- **THEN** `.system/` is replaced with the new content
- **AND** every user team directory is byte-identical to before the upgrade.

#### Scenario: Interrupted seeding does not leave a partial built-in area

- **GIVEN** seeding is in progress
- **WHEN** the process is killed before the marker file is written
- **THEN** the next startup finds a mismatched fingerprint and runs the full seeding flow again.

#### Scenario: Removed built-in team falls back rather than dangling

- **GIVEN** a built-in team existed in the previous version and is absent from the new `seed/teams`
- **WHEN** seeding replaces `.system/` and that team was recorded as the last used team
- **THEN** the last-used record falls back to the first built-in team
- **AND** existing sessions keep their history and the team version loaded at creation time.

### Requirement: Team structural readiness

- MUST treat a team as usable for creating a new conversation only when it has exactly one primary agent, that primary agent is a current member, every member has a team-unique slug, and every member's `AGENT.md` is readable.
- MUST treat a team with no primary agent as an unfinished draft, retained on the team list and marked as such.
- MUST treat a team as needing repair when its directory is missing or unreadable, when any member's `AGENT.md` is missing or unreadable, when any member lacks a slug, or when two members share a slug.
- MUST allow a single-member team to be usable when it otherwise satisfies the readiness conditions.
- MUST NOT analyze the natural-language content of `AGENT.md` when deciding readiness.
- MUST NOT check whether files referenced by `AGENT.md` exist when deciding readiness.
- MUST re-evaluate readiness after files are restored and clear the needs-repair state once all members are valid again.

#### Scenario: Duplicate slug blocks team usage

- **GIVEN** a user team whose two members carry the same slug
- **WHEN** the team list and the new-conversation team selector render
- **THEN** the team is marked as needing repair
- **AND** it cannot be selected for a new conversation.

#### Scenario: Unfinished draft does not count as broken

- **GIVEN** a team draft with no members yet
- **WHEN** the team list renders and the sidebar entry evaluates its indicator
- **THEN** the team is marked unfinished and cannot be used for a new conversation
- **AND** the sidebar entry shows no repair indicator.

### Requirement: Stable member slug and mention rendering

- MUST assign each member a team-unique slug at creation time and MUST keep it unchanged for the member's lifetime.
- MUST NOT expose any interface for editing a slug.
- MUST assign a new team-unique slug when a member is duplicated within the same team.
- MUST persist mentions in `AGENT.md` as the literal text `@<slug>`.
- MUST match only current members of the same team when completing a `@` mention, and MUST show both the readable name and `@<slug>` among the completion results.
- MUST render a stored mention as a component whose primary visible text is the member's current display name.
- MUST expose the underlying `@<slug>` for viewing and copying on hover and on keyboard focus.
- MUST NOT change the stored mention text when a member's display name changes.
- MUST NOT validate whether the surrounding natural-language handoff rules are correct.

#### Scenario: Renaming a member preserves references

- **GIVEN** other members' `AGENT.md` files contain mentions of a member
- **WHEN** that member's display name is changed in its own `AGENT.md`
- **THEN** the existing mention components display the new name
- **AND** the stored text in every referencing file still reads `@<slug>` with the original slug.

#### Scenario: External editor sees stable text

- **GIVEN** an `AGENT.md` containing mention components authored in the app
- **WHEN** the file is opened in a file manager or an external editor
- **THEN** the mentions appear as plain `@<slug>` text.

### Requirement: Per-member unsaved drafts

- MUST keep unsaved `AGENT.md` edits for multiple members simultaneously within one team detail view.
- MUST NOT auto-save `AGENT.md`.
- MUST NOT prompt when switching between members while drafts exist, and MUST preserve every draft across member switches, window resizing, and horizontal scrolling of the member selector.
- MUST save only the current member when the save action is invoked, and MUST support `Command/Ctrl + S`.
- MUST retain the edited content and show a reason with a retry affordance when a save fails.
- MUST offer continue-editing, discard-all, and save-all-and-leave when leaving the team detail with drafts outstanding.
- MUST keep successfully saved members saved and keep failed members' drafts when save-all-and-leave partially fails, MUST keep the user on the current team detail, and MUST show which members failed.
- MUST NOT report overall success when any member failed to save, and MUST NOT roll back members that already saved.
- MUST require the user to save or discard outstanding drafts before duplicating or deleting the affected team or member.

#### Scenario: Partial save-all is reported honestly

- **GIVEN** three members have unsaved drafts and the user chooses save-all-and-leave
- **WHEN** one member's save fails and two succeed
- **THEN** the two successful members are saved and their drafts cleared
- **AND** the failing member keeps its draft and appears in a failure list
- **AND** the user remains on the team detail view.

### Requirement: External modification conflict resolution

- MUST apply conflict handling only to user teams.
- MUST reload an externally updated `AGENT.md` and show a light notice when the app holds no unsaved content for that member.
- MUST keep the draft and notify that the file changed externally when the app holds an unsaved draft for that member.
- MUST offer exactly two resolutions: load the external version, or overwrite with the current content.
- MUST NOT silently pick either side.
- MUST NOT provide line-level diff or automatic merge.
- MUST NOT trigger a conflict prompt for external changes to files other than the members' `AGENT.md`.

#### Scenario: Draft is never silently overwritten

- **GIVEN** a member has an unsaved draft in the app
- **WHEN** the same member's `AGENT.md` is modified outside the app and the user returns to the app
- **THEN** the draft is preserved
- **AND** the user is asked to choose between loading the external version and overwriting with the current content.

### Requirement: Needs-repair propagation to the sidebar entry

- MUST show a single indicator on the sidebar "Agent 团队" entry whenever at least one team needs repair.
- MUST NOT scale that indicator with the number of affected teams.
- MUST expose the accessible name and hover text `有 Agent 团队需要修复` so the meaning does not depend on color alone.
- MUST NOT show the indicator for unfinished drafts.
- MUST mark the specific affected teams on the team list when the user opens the page from that entry.
- MUST keep an existing conversation's history viewable when its selected team needs repair, and MUST block sending new messages in that conversation.

#### Scenario: Multiple broken teams show one indicator

- **GIVEN** three teams need repair
- **WHEN** the sidebar renders
- **THEN** exactly one indicator appears on the "Agent 团队" entry with no count
- **AND** opening the page marks all three affected rows as needing repair.

### Requirement: Last-used team preselection

- MUST record the team used to successfully create a conversation, and MUST update that record only on successful creation.
- MUST NOT update the record when a team is opened, edited, browsed, or duplicated.
- MUST preselect the recorded team when a new conversation is started, and MUST allow changing the selection before creation.
- MUST fall back to the first built-in team when there is no recorded team, or when the recorded team has been deleted or needs repair.
- MUST NOT provide a user-configurable application-level default team.

#### Scenario: Browsing does not change the preselection

- **GIVEN** team A is the recorded last-used team
- **WHEN** the user opens team B, edits a member's `AGENT.md`, saves it, and then starts a new conversation
- **THEN** team A is still preselected.
