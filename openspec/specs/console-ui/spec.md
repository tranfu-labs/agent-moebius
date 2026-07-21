# console-ui 规格

## Purpose

`console-ui` 是桌面对话操作台的 React 组件库与开发期展示台。它提供可被 Electron renderer 消费的 shadcn 风格源码组件、Radix 无障碍原语封装、Tailwind 近单色令牌和项目专属复合组件；它不承载真实桌面对话操作台的数据流、IPC、runner 状态管理或 GitHub / Codex 调用。

## Requirements

### Requirement: Package boundary and Storybook source of truth

The `console-ui` domain MUST provide a workspace package named `@agent-moebius/console-ui` under `packages/console-ui`.

The `console-ui` package MUST expose React components and global styles so the desktop renderer can import `@agent-moebius/console-ui` and `@agent-moebius/console-ui/globals.css`.

The `console-ui` package MUST use shadcn-style source components built on Tailwind CSS variables and Radix primitives, with component source checked into this repository rather than hidden behind a runtime UI package.

The `console-ui` package MUST provide Storybook as the development-time browser showcase for console UI components.

The `console-ui` package MUST include at least one shadcn-style primitive sample and one project-specific composite sample so the token chain, Storybook setup, and renderer-consumable package shape are verified.

The `console-ui` package MUST keep Storybook under `packages/console-ui` as the only shipped browser showcase for this domain.

The `console-ui` package MUST NOT keep a parallel static Tailwind HTML component library as a second UI source of truth.

#### Scenario: Renderer can consume the component library

- **GIVEN** a desktop renderer needs console UI components
- **WHEN** it imports `@agent-moebius/console-ui` and `@agent-moebius/console-ui/globals.css`
- **THEN** it can render React components with the package-local global styles.

#### Scenario: Storybook shows package samples

- **GIVEN** a developer runs `pnpm --filter @agent-moebius/console-ui storybook`
- **WHEN** Storybook starts
- **THEN** the browser showcase includes a primitive button story and a project-specific acceptance card story.

### Requirement: Compiled global-style package boundary

The `console-ui` package MUST compile its Tailwind directives and `@apply` rules during package build and MUST expose the compiled stylesheet as `@agent-moebius/console-ui/globals.css`.

The desktop renderer MUST consume the compiled package stylesheet and MUST NOT rely on Chromium to interpret Tailwind build directives.

The desktop renderer host stylesheet MUST remain limited to window/root hosting concerns and MUST NOT duplicate component layout, button, textarea, card, badge, sidebar, or composer styling owned by `console-ui`.

The desktop build MUST fail when its emitted renderer stylesheet still contains Tailwind build directives or does not contain representative `console-ui` utilities.

#### Scenario: Desktop renderer receives compiled component styles

- **GIVEN** the desktop renderer imports `@agent-moebius/console-ui/globals.css`
- **WHEN** the desktop application is built
- **THEN** the emitted renderer stylesheet contains the component library token and utility styles
- **AND** it contains no `@tailwind` or `@apply` build directives.

#### Scenario: Desktop host CSS does not become a second component library

- **GIVEN** the desktop console page has a host stylesheet
- **WHEN** its selectors are inspected
- **THEN** it only establishes window/root hosting behavior
- **AND** component visual and layout rules remain owned by `console-ui`.

### Requirement: Design language governance

The `console-ui` package MUST keep `packages/console-ui/DESIGN.md` as the package-local design language fact source covering token usage discipline, typography rules, icon rules, status semantics and hue budget, elevation/focus/motion rules, and a catalog of component patterns pointing at the component source files that implement them.

New or modified components under `packages/console-ui` MUST compose the tokens, status semantics, and patterns recorded in `packages/console-ui/DESIGN.md` rather than introducing ad-hoc visual values; when a genuinely new pattern is introduced, the same change MUST add it to `packages/console-ui/DESIGN.md`.

`DESIGN.md` MUST record its external design references by link and attribution only, and MUST NOT vendor third-party design specification content.

#### Scenario: New component follows the design language

- **GIVEN** a developer adds a new console UI component
- **WHEN** the component and `DESIGN.md` are inspected
- **THEN** the component composes existing tokens and status semantics without hard-coded visual values
- **AND** any pattern not previously cataloged has been added to `DESIGN.md` in the same change.

### Requirement: Near-monochrome token system

The `console-ui` package MUST keep `packages/console-ui/src/styles/tokens.css` as the package-local token source in Linear's restrained palette direction: cool-tinted neutral surfaces and text dominate, indigo `#5E6AD2` is the single interaction accent in both light and dark themes, green/red are reserved for verdict and danger facts, and waiting-for-human states use neutral structural signals instead of a dedicated hue.

The token source MUST define a per-theme accent hover color (`#4B57C8` darker in light, `#828FFF` lighter in dark), a multi-layer popover shadow token, a double-layer indigo focus ring token, and motion tokens (150ms default duration with an easeOutQuad-style curve, plus a slower entrance curve).

Dark-theme elevation MUST be expressed through luminance stacking (progressively lighter translucent surfaces and inset hairlines) rather than heavy drop shadows.

The `console-ui` package MUST map core shadcn semantic variables (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, `--ring`) onto the console token variables in `globals.css`.

The `console-ui` package MUST self-host Inter Variable (woff2 subset with the wght axis and `cv01`/`ss03` OpenType features, OFL 1.1) as the primary Latin typeface with system CJK fallback; UI emphasis text MUST use weight 510 and titles weight 590; body text below 16px MUST use zero letter-spacing.

The `console-ui` package MUST render waiting-for-human review surfaces as neutral surfaces with neutral waiting iconography.

The `console-ui` package MUST render pass/fail verdicts as colored dot-plus-text markers (green/red) on acceptance surfaces.

The `console-ui` package MUST render submit actions using indigo as an interaction color rather than a waiting-state color.

Icons across the package MUST use 16px default size with 1.5px stroke width.

#### Scenario: Waiting-for-human state stays neutral

- **GIVEN** an acceptance card is rendered for a waiting-for-human review
- **WHEN** the component is inspected
- **THEN** the card remains a neutral surface with neutral waiting iconography, pass/fail verdicts use colored dot-plus-text markers, and the submit action uses indigo as an interaction color.

#### Scenario: Interactive accent is indigo in both themes

- **GIVEN** the console renders in light theme and in dark theme
- **WHEN** primary buttons, links, and focus rings are inspected
- **THEN** the accent is `#5E6AD2` in both themes, hover moves to `#4B57C8` in light and `#828FFF` in dark, and focus rings use the double-layer indigo token.

### Requirement: No runner or desktop integration dependencies

The `console-ui` package MUST stay free of runner, observer, GitHub, Codex, `.state`, and IPC dependencies.

The `console-ui` package MUST NOT implement real desktop console app state management, renderer bundling, IPC, or runner/state-file integration in this domain.

#### Scenario: Console UI remains presentational

- **GIVEN** a component under `packages/console-ui/src`
- **WHEN** its imports are inspected
- **THEN** it does not import runner, observer, GitHub, Codex, `.state`, IPC, or desktop main-process modules.

### Requirement: Operator console presentational components

The `console-ui` package MUST provide presentational React components for the local operator console: project/session sidebar, session timeline, user/agent/system message rows, run live block, local error/interrupted/stuck records, message composer, and diagnostic action affordances.

The operator console components MUST remain controlled by props and callbacks supplied by the desktop renderer.

The operator console MUST render running states with a non-empty summary, elapsed time or runDir evidence, and an interrupt action when `interruptible` is true.

The operator console MUST render interrupted and stuck runs distinctly from failed runs; interrupted runs must use neutral status styling, stuck runs must be visibly marked as stuck, and failed runs must use danger fact styling.

The operator console MUST render failed local errors visibly with reason and runDir when available.

The operator console MUST support a controlled list of local projects and render sessions under their owning project while preserving the project-to-session hierarchy.

Selecting a project or a session and creating a session for a project MUST flow through callbacks with an explicit project id.

The operator console MUST render each project title from the real directory title supplied by local console state and MUST expose folder opening through a callback rather than filesystem or Electron access.

Workspace mode mutation MUST remain a controlled callback. A `not-git-repository` workspace-unavailable reason MUST remain distinct from running, waiting, stuck, failed, and interrupted session states wherever diagnostics present it.

The operator console MUST render tail-read fallback or diagnostic copy without leaving the run live block blank.

#### Scenario: Run live block is non-empty

- **GIVEN** a run live block receives a running snapshot with no parseable output
- **WHEN** it renders
- **THEN** it displays a deterministic running summary, elapsed time or runDir evidence, and no empty card.

#### Scenario: Interrupted, stuck, and failed states are distinct

- **GIVEN** one timeline record is interrupted, another timeline record is stuck, and another timeline record is failed
- **WHEN** the timeline renders
- **THEN** the interrupted record uses neutral status styling, the stuck record is visibly marked as stuck, and the failed record uses danger fact styling.

#### Scenario: Multiple projects preserve session ownership

- **GIVEN** the operator console receives two local projects whose sessions have running, stuck, failed, and idle states
- **WHEN** the sidebar renders
- **THEN** it shows both real project titles, every session under its owning project, and visible state indicators for running, stuck, and failed sessions
- **AND** selecting a project or session calls the supplied callback with explicit ownership context.

### Requirement: Project-scoped new sessions and empty-session project switching

The operator console MUST provide a project-specific new-session button on every project folder row and MUST pass that row's project id through a controlled callback.

The operator console MUST NOT depend on an implicitly selected project to decide the destination of a project-row new-session action, and MUST NOT retain a global new-session entry whose project ownership is ambiguous.

For a selected session with no messages, active run, parent, or child relationship, the composer project context MUST expose an accessible menu of opened projects, mark the current project, and pass the session id plus target project id through a controlled callback.

The composer draft MUST remain controlled by the renderer and MUST survive a successful project rebind. Once a session has messages, an active run, a parent, or children, the project context MUST remain visible but MUST NOT expose a project-switch menu.

### Requirement: Selection mutation serialization

While create session, open project, or session project rebind is pending, the operator console MUST disable sidebar session selection, project-row new-session buttons, the open-project button, and the project-switch menu.

The renderer callback/handler boundary MUST reject selection intents that arrive while another selection-changing mutation owns the gate; disabled presentation alone is not a correctness boundary.

At most one selection-changing mutation may open a picker or send an API request at a time, and only its owner may commit the target selection.

During a selection mutation, non-owner refreshes MUST NOT commit state or selection. The owner target refresh MUST be able to replace an older refresh lease, while periodic refresh remains single-flight so a slow request is not starved by the next polling tick.

Mutation cancellation or failure before API success MUST preserve the original selection. If the API succeeds but the following refresh fails, the target selection MUST remain committed so a later refresh can recover from it.

During session project rebind, the project menu and send action MUST be disabled, and the submit handler MUST reject a first-message callback until rebind settles.

#### Scenario: Project row creates a session for that project

- **GIVEN** the sidebar receives two projects
- **WHEN** the user activates the new-session button on the second project row
- **THEN** the controlled callback receives the second project id
- **AND** no callback is emitted for the first project.

#### Scenario: Empty session changes project without losing its draft

- **GIVEN** the selected session has no messages, active run, parent, or children
- **WHEN** the user selects another project from the composer project menu
- **THEN** the callback receives the selected session id and target project id
- **AND** the composer draft remains unchanged.

#### Scenario: Historical or related session keeps project locked

- **GIVEN** the selected session has messages, an active run, a parent, or children
- **WHEN** the composer context renders
- **THEN** the current project remains visible
- **AND** no project-switch menu is available.

#### Scenario: Selection-changing mutations remain serialized

- **GIVEN** a create session, open project, or session project rebind mutation is pending
- **WHEN** another selection, creation, project opening, project rebind, refresh, or first-message intent arrives
- **THEN** it cannot commit a second selection or duplicate side effect
- **AND** only the owner mutation may commit its target selection and refresh result.

### Requirement: Flat session rail with persisted lineage

The operator console MUST render every session under a project as a flat peer list even when persisted session summaries contain `parentSessionId`.

Runtime lineage MUST NOT produce indentation, tree connectors, expand/collapse controls, child-count summaries, or parent breadcrumbs in the primary console.

The operator console MUST keep every session controlled by the same selected session id and MUST restore the selected session after refresh.

The operator console MUST render each session at most once even when parent session references are missing, cyclic, self-referential, or otherwise corrupt.

- MUST render session rows within a project in stable `createdAt` DESC order.
- MUST NOT reorder session rows based on session status changes, active runs, streaming output, unread results, human-attention needs, or timer updates.
- MUST NOT render a fixed "completed" grouping or auto-collapse group in the sidebar.
- MUST require an explicit user archive action to remove a session from the sidebar; archived sessions MUST NOT be shown in the primary sidebar rail.
- MUST expose an accessible label on child session rows indicating the parent session, without introducing indentation.

#### Scenario: Session order is stable under state changes

- **GIVEN** a project has multiple sessions displayed in the sidebar
- **WHEN** any of those sessions starts running, produces a new agent result, becomes selected, or requires human attention
- **THEN** the display order in the sidebar remains unchanged
- **AND** only the row-level status indicator updates.

#### Scenario: No completed folding group

- **GIVEN** a project has sessions whose backend lifecycle is terminal
- **WHEN** the sidebar renders that project
- **THEN** no "completed" collapse control or grouping appears
- **AND** those sessions render as ordinary rows with no status dot unless archived.

#### Scenario: Derived sessions remain peers

- **GIVEN** a project has an original session and derived sessions whose `parentSessionId` references the original
- **WHEN** the operator console sidebar renders
- **THEN** every session uses the same row indentation and selection model
- **AND** no tree connector, expand control, child summary, or parent breadcrumb is shown.

#### Scenario: Corrupt lineage stays bounded and visible

- **GIVEN** flat session summaries contain a parent cycle, self-parent reference, or missing parent reference
- **WHEN** the operator console sidebar renders
- **THEN** rendering completes and each session appears exactly once as a peer row.

### Requirement: Conversation status dot semantics

- MUST derive at most one status dot per session row and per collapsed project row from three orthogonal facts: `needsHuman`, `hasUnreadResult`, `isRunning`.
- MUST apply the priority `red > blue > blink > none` when more than one fact is true.
- MUST render `red` when `needsHuman` is true (人工回答/确认/验收/异常处理阻塞后续推进).
- MUST render `blue` when `needsHuman` is false and `hasUnreadResult` is true (本轮 agent 结束但用户未查看结果).
- MUST render `blink` when `needsHuman` and `hasUnreadResult` are both false and `isRunning` is true.
- MUST render no dot otherwise.
- MUST NOT rely on color alone; each dot MUST expose an accessible name distinguishable without color: `需要你处理` / `有新结果` / `正在运行`.
- MUST clear the blue dot after the user opens the session and the latest result becomes visible.
- MUST NOT clear the red dot merely because the user views the session; only completing the required action or the task becoming self-advancing clears it.

#### Scenario: Priority holds when facts overlap

- **GIVEN** a session simultaneously needs a human answer and has unread agent output
- **WHEN** the sidebar renders that session row
- **THEN** exactly one red dot is shown
- **AND** its accessible name reads `需要你处理`.

### Requirement: Collapsed project status aggregation

- MUST allow each project row to be independently collapsed or expanded by the user.
- MUST NOT show a per-session status dot on the project row while the project is expanded.
- MUST show a single aggregated dot on a collapsed project row using the same `red > blue > blink` priority derived from all sessions inside that project.
- MUST NOT show a numeric count of unread or running sessions on the project row.
- MUST allow the project containing the currently selected session to be manually collapsed; the main content MUST continue showing the selected session and MUST NOT auto re-expand the project.
- MUST NOT change the currently selected session as a result of collapsing or expanding a project.

### Requirement: Sidebar collapse, restore, and layout memory

- MUST provide a `关闭侧边栏` control fixed in the sidebar header that hides the sidebar when activated.
- MUST provide a `打开侧边栏` control fixed in the main content when the sidebar is hidden, functional and not a decorative placeholder.
- MUST expand the main content region to reclaim the space when the sidebar is hidden.
- MUST persist the last explicit user choice of collapsed/expanded across app restarts.
- MUST keep the sidebar visible during the first-run onboarding regardless of the persisted choice.
- MUST preserve the currently selected session, project expanded/collapsed state, and project list scroll offset across a collapse+restore cycle.
- MUST NOT re-mount the main content timeline or active run block as a side effect of the sidebar collapse/restore.

### Requirement: Project row menu and directory repair

- MUST provide a project row context menu with exactly these items: `在文件管理器中显示`, `修改显示名称`, `移除项目`.
- MUST render a separate red wrench button on the project row (outside the context menu) when the project folder is unavailable, with an accessible name explaining "当前项目本地文件夹未找到，可以指定新的文件夹".
- MUST NOT place directory repair inside the context menu.
- MUST route directory repair through the desktop native folder picker and MUST enforce that a single filesystem folder is bound to at most one active project.
- MUST NOT move, copy, or rename any files on disk during directory repair; only the recorded project location updates.
- MUST show both the original and newly selected locations in a confirmation surface before applying the repair.
- MUST reject remove when the project has running agents unless the user confirms an explicit "强制中止" flow that runs abort then remove as an ordered sequence; partial failures MUST NOT be reported as success.
- MUST NOT delete or modify the underlying folder on disk when a project is removed; the removal only affects agent-moebius records.

### Requirement: Manual project reorder without a dedicated drag handle

- MUST allow the user to drag a project row to reorder projects, using the row itself as the drag surface.
- MUST NOT render a separate drag handle on project rows.
- MUST distinguish click from drag using an explicit movement threshold; a drag operation MUST NOT trigger expand/collapse on release.
- MUST persist project order across app restarts.
- MUST NOT reorder projects automatically as a result of session state changes, active runs, new results, or human-attention transitions.
- MUST place newly added projects at the top of the list, auto-expanded, and MUST make the new project the current project.
- MUST make `＋` and `⋯` buttons inside a project row independent controls whose events do not bubble to the row's click or drag surface.

### Requirement: Conversation archive without a completed lifecycle

- MUST provide an archive action reachable from a conversation row's hover, keyboard focus, or context menu.
- MUST NOT introduce a "completed" sidebar status or a completed grouping folder.
- MUST reject archive on a session that has a currently running agent; the user must interrupt or wait for the run to end.
- MUST clear any active run association and stop local handoff drain immediately when a session is archived; resuming archive MUST allow the local cursor to continue from where it stopped without duplicate processing.
- MUST, after archiving the currently selected session, select an adjacent visible session in the same project; if none remain, MUST show the project empty state.
- MUST preserve messages, execution records, and delivered artifacts of archived sessions; archived sessions MUST remain retrievable via global search.

### Requirement: Sidebar width and narrow-window auto-collapse

- MUST expose a draggable right boundary on the sidebar with enforced minimum and maximum widths.
- MUST truncate long names to a single line and MUST expose the full text via hover tooltip and accessible name.
- MUST scroll only the project list when window height is insufficient; the top actions row, sidebar close button, and bottom settings entry MUST remain reachable.
- MUST auto-collapse the sidebar when the window width drops below the main page's minimum usable width.
- MUST NOT oscillate between collapsed and expanded state when the width crosses the threshold repeatedly; the persisted user choice governs restoration when the window widens.

### Requirement: Application-level entries above the project list

- MUST render `＋ 新建对话`, `⌕ 搜索`, and `◇ Agent 团队` fixed above the project list at the same row height, text hierarchy, and interaction style; the three MUST NOT visually promote Agent 团队 over the others.
- MUST NOT nest Agent 团队 inside settings.
- MUST route `＋ 新建对话` to the new-conversation window without persisting an empty blank session on click.
- MUST route `⌕ 搜索` to the global search surface; closing that surface MUST restore the previous sidebar selection.
- MUST route `◇ Agent 团队` to the Agent Teams surface and show a selected state on the entry while that surface is active.
- MUST keep the bottom-fixed `⚙ 设置` entry the only settings entrypoint from the sidebar; internal diagnostics identifiers such as database paths, run directories, or raw errors MUST NOT be rendered at the bottom of the sidebar.

### Requirement: Flat Card and status Badge baseline

The shared `Card` primitive MUST remain a flat container baseline with thin border, neutral surface, no default shadow, and square or near-square radius.

The shared `Card` primitive MUST NOT default to a floating or soft-card appearance.

The shared `Badge` primitive MUST expose variants as runtime status semantics instead of generic visual names, and MUST render every variant as a dot-plus-text marker rather than a filled or outlined chip.

The shared `Badge` primitive MUST cover `running`, `failed`, `waiting`, `interrupted`, `idle`, `pending`, `completed`, `displayed`, and `stuck` as status semantics used by the operator console, with dot hues following status semantics: accent for running, danger for failed and stuck, and neutral (filled or hollow) for all others.

The shared `Badge` primitive MUST NOT retain `neutral`, `selected`, `accent`, `pass`, or `danger` as compatibility aliases.

The shared `Badge` primitive MUST reserve pass/fail verdict coloring for acceptance verdict surfaces rather than mapping ordinary completed or displayed runtime states to verdict semantics.

#### Scenario: Storybook shows flat primitives and dot status

- **GIVEN** a developer runs `pnpm --filter @agent-moebius/console-ui storybook`
- **WHEN** the Card and Badge stories render
- **THEN** Card appears as a flat thin-border surface, Badge stories show all nine status semantic variants as dot-plus-text markers, and the stories do not show a separate floating component-library visual language.

### Requirement: Codex-native single-stream operator console

The operator console MUST use a Codex-desktop-style two-column frame consisting of an integrated project/session rail and one conversation canvas with a bottom composer.

The default conversation surface MUST NOT render a session header toolbar, aggregate passed/running/waiting counters, a persistent diagnostics button, a persistent worktree toggle, or expandable raw machine data.

User, agent, and system records MUST appear in one chronological stream. Agent identity MUST use a Linear-inbox-style row: a compact circular role avatar with a stage corner badge, the localized role name and inline state metadata on the first line, and rows separated by hairline dividers rather than floating message cards or per-agent columns.

Active runs, waiting-for-human facts, failures, stuck results, and interruptions MUST remain in the chronological stream and MUST preserve interrupt or diagnostic actions.

The bottom composer MUST display the current project and workspace context. Workspace mutation MUST reuse the existing direct/worktree callback without changing runtime workspace semantics.

Raw project paths, SQLite paths, session ids, run ids, run directories, working directories, machine output, and workspace-unavailable diagnostics MUST NOT be visible on the default conversation surface; failures MAY offer a contextual action that opens auxiliary developer diagnostics.

#### Scenario: Empty session matches the Codex frame

- **GIVEN** the selected session has no messages or active run
- **WHEN** the operator console renders
- **THEN** the rail remains visible, the canvas shows a concise project invitation, and the composer stays near the bottom
- **AND** no session toolbar or aggregate counters are shown.

#### Scenario: Multiple agents share one stream

- **GIVEN** a session contains replies from product-manager, dev, and qa
- **WHEN** the timeline renders
- **THEN** replies appear in timestamp order as hairline-separated inbox rows with distinct localized role identities
- **AND** no per-agent panel, floating message card, or dashboard is created.

#### Scenario: Workspace changes from composer context

- **GIVEN** a project supports worktree mode
- **WHEN** the user activates the workspace context item
- **THEN** the existing project workspace mutation callback receives the new mode
- **AND** the rail has no persistent worktree button.

#### Scenario: Machine details stay out of conversation

- **GIVEN** a run snapshot contains cwd, runDir, workspace mode, raw output, and diagnostics
- **WHEN** the default console renders
- **THEN** none of those machine values are visible in the rail, canvas, or composer
- **AND** a readable failure summary may offer a developer-diagnostics action.

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
