# console-ui 规格

## Purpose

`console-ui` 是桌面对话操作台的 React 组件库与开发期展示台。它提供可被 Electron renderer 消费的 shadcn 风格源码组件、Radix 无障碍原语封装、Tailwind 语义令牌（近黑底暗色优先 + 状态色相族）和项目专属复合组件；它不承载真实桌面对话操作台的数据流、IPC、runner 状态管理或 GitHub / Codex 调用。

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

### Requirement: Token system with status hue family

Source: docs/product/prd.md#视觉语言原则

The `console-ui` package MUST keep `packages/console-ui/src/styles/tokens.css` as the package-local token source: cool-tinted neutral surfaces and text dominate, indigo `#5E6AD2` is the single interaction accent in both light and dark themes, and green/red remain reserved for verdict and danger facts.

The token source MUST define a status hue family for runtime status pills — amber for running, blue for pending, violet for waiting, and a neutral tint — with foreground, tinted background, and same-hue border values defined for BOTH light and dark themes in the same change.

The token source MUST define the dark canvas near `#0A0B0D` with card surfaces near `#15161A` and visibly stronger borders than the previous near-monochrome baseline, and MUST set the corner-radius base token to 14px with derived steps computed from it.

The token source MUST define a per-theme accent hover color (`#4B57C8` darker in light, `#828FFF` brighter in dark), a multi-layer popover shadow token, a double-layer indigo focus ring token, and motion tokens (150ms default duration with an easeOutQuad-style curve, plus a slower entrance curve).

Dark-theme elevation MUST be expressed through luminance stacking (progressively lighter translucent surfaces and inset hairlines) rather than heavy drop shadows.

The `console-ui` package MUST map core shadcn semantic variables (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, `--ring`) onto the console token variables in `globals.css`.

The `console-ui` package MUST self-host Inter Variable (woff2 subset with the wght axis and `cv01`/`ss03` OpenType features, OFL 1.1) as the primary Latin typeface with system CJK fallback; UI emphasis text MUST use weight 510 and titles weight 590; body text below 16px MUST use zero letter-spacing.

The `console-ui` package MUST render waiting-for-human review surfaces as neutral surfaces with neutral waiting iconography.

The `console-ui` package MUST render pass/fail verdicts as pass/failed status pills (green/red) on acceptance surfaces.

The `console-ui` package MUST render submit actions using indigo as an interaction color rather than a waiting-state color.

A red unread-count badge MAY use the danger hue as the single registered exception to verdict/danger exclusivity; all other uses of green/red outside verdict, danger, and this exception MUST NOT be introduced.

Icons across the package MUST use 16px default size with 1.5px stroke width.

#### Scenario: Waiting-for-human state stays neutral

- **GIVEN** an acceptance card is rendered for a waiting-for-human review
- **WHEN** the component is inspected
- **THEN** the card remains a neutral surface with neutral waiting iconography, pass/fail verdicts use pass/failed status pills, and the submit action uses indigo as an interaction color.

#### Scenario: Interactive accent is indigo in both themes

- **GIVEN** the console renders in light theme and in dark theme
- **WHEN** primary buttons, links, and focus rings are inspected
- **THEN** the accent is `#5E6AD2` in both themes, hover moves to `#4B57C8` in light and `#828FFF` in dark, and focus rings use the double-layer indigo token.

#### Scenario: Status hue family exists in both themes

- **GIVEN** the token source loads
- **WHEN** running, pending, and waiting status pills render in either theme
- **THEN** each uses its own hue family (amber / blue / violet) with foreground, tinted background, and same-hue border tokens defined for that theme
- **AND** no status hue token is defined for only one theme.

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

The operator console MUST render running states with a non-empty summary and an interrupt action when `interruptible` is true.

The operator console MUST render interrupted and stuck runs distinctly from failed runs; interrupted runs must use neutral status styling, stuck runs must be visibly marked as stuck, and failed runs must use danger fact styling.

The operator console MUST render failed local errors visibly with a reason.

The operator console MUST support a controlled list of local projects and render sessions under their owning project while preserving the project-to-session hierarchy.

Selecting a project or a session and creating a session for a project MUST flow through callbacks with an explicit project id.

The operator console MUST render each project title from the real directory title supplied by local console state and MUST expose folder opening through a callback rather than filesystem or Electron access.

Workspace mode mutation MUST remain a controlled callback. A `not-git-repository` workspace-unavailable reason MUST remain distinct from running, waiting, stuck, failed, and interrupted session states wherever diagnostics present it.

The operator console MUST render tail-read fallback or diagnostic copy without leaving the run live block blank.

#### Scenario: Run live block is non-empty

- **GIVEN** a run live block receives a running snapshot with no parseable output
- **WHEN** it renders
- **THEN** it displays a deterministic running summary and no empty card.

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

The operator console MUST NOT depend on an implicitly selected project to decide the destination of a project-row new-session action.

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

### Requirement: Root session rail with persisted runtime lineage

The operator console MUST render only root sessions whose persisted summaries have no `parentSessionId` in the primary sidebar rail. Derived sessions MUST be reachable from their parent timeline card and MUST NOT render as sidebar rows or lineage labels.

Runtime lineage MUST remain persisted for orchestration and recovery, and MUST NOT produce indentation, tree connectors, expand/collapse controls, child-count summaries, parent breadcrumbs, or duplicate child entry points in the primary sidebar.

The operator console MUST keep root-session selection stable after refresh. Missing, cyclic, self-referential, or otherwise corrupt non-root references MUST remain bounded and MUST NOT force a derived session into the sidebar.

- MUST render visible root session rows within a project in stable `createdAt` DESC order.
- MUST NOT reorder root session rows based on session status changes, active runs, streaming output, unread results, human-attention needs, or timer updates.
- MUST NOT render a fixed "completed" grouping or auto-collapse group in the sidebar.
- MUST require an explicit user archive action to remove a root session from the sidebar; archived root sessions MUST NOT be shown in the primary sidebar rail.

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

#### Scenario: Derived sessions use the parent timeline card

- **GIVEN** a project has an original session and derived sessions whose `parentSessionId` references the original
- **WHEN** the operator console sidebar renders
- **THEN** only the original root session appears in the sidebar
- **AND** the derived sessions remain available from the parent timeline card without a lineage label or tree control.

#### Scenario: Corrupt lineage stays bounded without creating sidebar rows

- **GIVEN** flat session summaries contain a parent cycle, self-parent reference, or missing parent reference
- **WHEN** the operator console sidebar renders
- **THEN** rendering completes without a derived sidebar row or duplicate entry point
- **AND** valid root sessions remain selectable.

### Requirement: Conversation status dot semantics

- MUST derive at most one status dot per session row and per collapsed project row from unresolved run facts, non-continuable session state, unread result state, the latest-message mention fact, and active-run state.
- MUST apply the priority `red > blue > blink > none` when more than one fact is true.
- MUST render `red` only for an unresolved run-not-started, run-stuck, or retry-exhausted fact, or when the session cannot continue because its project folder is unavailable, its team was deleted, or its team needs repair.
- MUST render `blue` when nobody is running, the latest message mentions no team member, and the latest result has not been viewed.
- MUST render `blink` when no red or blue condition applies and a member is running.
- MUST render no dot otherwise.
- MUST NOT render red or blue when the latest message mentions a team member; MUST NOT render red merely because the user stopped a run, a run completed normally, or an old waiting-for-human field is present.
- MUST NOT rely on color alone; each dot MUST expose an accessible name distinguishable without color: `发生异常` / `有新结果` / `正在运行`.
- MUST clear the blue dot after the user opens the session and the latest result becomes visible.

#### Scenario: Priority holds when facts overlap

- **GIVEN** a session simultaneously has an unresolved stuck run and an unread result
- **WHEN** the sidebar renders that session row
- **THEN** exactly one red dot is shown
- **AND** its accessible name reads `发生异常`.

### Requirement: Collapsed project status aggregation

- MUST allow each project row to be independently collapsed or expanded by the user.
- MUST NOT show a per-session status dot on the project row while the project is expanded.
- MUST show a single aggregated dot on a collapsed project row using the same `red > blue > blink` priority derived from all sessions inside that project.
- MUST NOT show a numeric count of unread or running sessions on the project row.
- MUST allow the project containing the currently selected session to be manually collapsed; the main content MUST continue showing the selected session and MUST NOT auto re-expand the project.
- MUST NOT change the currently selected session as a result of collapsing or expanding a project.

### Requirement: Sidebar collapse, restore, and layout memory

- MUST provide a `关闭侧边栏` control fixed in the sidebar header that hides the sidebar when activated.
- MUST define one shared 46px window header height, reserve the macOS traffic-light safety area in that dedicated top row, render only the sidebar close control in that row, vertically center the native traffic lights and controls through the shared header container without per-control offsets, and render the product logo and brand in a separate row below it.
- MUST provide a `打开侧边栏` control fixed in the main content when the sidebar is hidden, functional and not a decorative placeholder.
- MUST position the `打开侧边栏` control to the right of the macOS traffic-light safety area and vertically center it with the native traffic lights when the sidebar is hidden.
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
- MUST route `＋ 新建对话` to the new-conversation page in the main content area without persisting an empty blank session on click.
- MUST route `⌕ 搜索` to the global search surface; closing that surface MUST restore the previous sidebar selection.
- MUST route `◇ Agent 团队` to the Agent Teams surface and show a selected state on the entry while that surface is active.
- MUST keep the bottom-fixed `⚙ 设置` entry the only settings entrypoint from the sidebar; internal diagnostics identifiers such as database paths, run directories, or raw errors MUST NOT be rendered at the bottom of the sidebar.

### Requirement: Status pill Badge baseline

Source: docs/product/prd.md#视觉语言原则

The shared `Card` primitive MUST remain a thin-border neutral surface without default shadows, using the 14px radius baseline and visibly bordered dark surfaces.

The shared `Card` primitive MUST NOT default to a floating or soft-card appearance.

The shared `Badge` primitive MUST expose variants as runtime status semantics instead of generic visual names, and MUST render every variant as a status pill: a 12px status icon plus text on a tinted background with a same-hue border and fully rounded shape.

The shared `Badge` primitive MUST cover `running`, `failed`, `waiting`, `interrupted`, `idle`, `pending`, `completed`, `displayed`, and `stuck` as status semantics used by the operator console, plus `pass` for verdict surfaces, with icon and hue following status semantics: half-pie amber for running, clock blue for pending, hollow-circle violet for waiting, dashed-circle neutral for interrupted and idle, filled-disc neutral tint for completed and displayed, crossed-circle danger for failed and stuck, and checked-circle pass green for verdict pass.

The shared `Badge` primitive MUST NOT retain `neutral`, `selected`, `accent`, or `danger` as compatibility aliases.

The shared `Badge` primitive MUST reserve pass/fail verdict coloring for acceptance verdict surfaces rather than mapping ordinary completed or displayed runtime states to verdict semantics.

#### Scenario: Badge stories show status pills

- **WHEN** the Card and Badge stories render
- **THEN** Card appears as a thin-border surface on the new radius baseline, and Badge stories show every status semantic variant as an icon-plus-text pill with its hue family.

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

> Agent 团队的磁盘布局、内置团队播种与结构有效性判定属于 `desktop-shell` 域（见 `openspec/specs/desktop-shell/spec.md` 的「Agent 团队存储」）；本域只规定这些事实在界面上如何呈现与交互。

### Requirement: Agent team member initial avatars

Source: docs/product/pages/agent-teams.md#Agent-身份与说明

The Agent Teams surface MUST render the same neutral circular initial-avatar pattern for each member in the team-list member item, the detail member selector, and the current-member heading.

The avatar glyph MUST use the first visible character of the member display name, MUST fall back to the first character of the stable member slug when the display name is unavailable, and MUST uppercase Latin fallback or display initials.

The surface MUST NOT require or persist an image, image path, or separate avatar metadata field for this identity marker.

#### Scenario: Canonical display name supplies the avatar

- **GIVEN** a team member has display name `软件测试` and slug `qa`
- **WHEN** the team list, member selector, and current-member heading render that member
- **THEN** all three surfaces show the neutral circular glyph `软` beside the same readable identity.

#### Scenario: Missing display name falls back to slug

- **GIVEN** an intermediate or unavailable member summary has an empty display name and slug `dev-manager`
- **WHEN** an initial avatar is rendered
- **THEN** the neutral circular glyph is `D`
- **AND** no image or avatar metadata is required.

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

### Requirement: Needs-repair propagation to the sidebar entry

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

### Requirement: Conversation view routing

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

- MUST NOT rewrite the editor's content or reset the caret while an input method composition is in progress.
- MUST commit the composed text once, after the composition ends.
- MUST verify this through tests that drive the real input path, and MUST NOT assert it by assigning element text directly.

#### Scenario: Composing text is not interrupted

- **GIVEN** the user is composing text with an input method in the `AGENT.md` editor
- **WHEN** intermediate composition updates occur
- **THEN** the composition continues uninterrupted
- **AND** the caret stays where the user was typing.

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

## Requirement: 验收 1 — 新对话使用主内容页面
Source: docs/product/pages/main-conversation.md#页面目标

系统 MUST 在主内容区显示标题为“新对话”的新对话页面，并把侧边栏顶部“新建对话”入口显示为当前选中。系统 MUST NOT 打开模态弹窗、独立窗口或在侧边栏新增会话行。

### Scenario: 从全局入口进入新对话页
- GIVEN 主页面已有至少一个持久化会话
- WHEN 用户点击侧边栏顶部“新建对话”
- THEN 主内容区显示“新对话”页面且原会话行数量不变

## Requirement: 验收 2 — 未选项目时保持可编辑但禁止发送
Source: docs/product/pages/main-conversation.md#页面状态

系统 MUST 在全局入口进入时保持项目未选择、草稿输入可编辑、团队选择可用，并以内联常驻文字说明不能发送的原因。系统 MUST NOT 猜测第一个项目或上次项目，也 MUST NOT 在未选项目时显示工作区与分支上下文或允许发送。

### Scenario: 无项目的新对话初始态
- GIVEN 至少存在一个可用项目与一支可用团队
- WHEN 用户从侧边栏顶部进入新对话页
- THEN 项目保持未选择、输入框可编辑、发送按钮禁用且页面显示原因文字

## Requirement: 验收 3 — 首次发送后才出现会话
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 在项目、团队和非空草稿齐备时以一次创建操作提交首条消息，并在成功后选择返回的会话、清除新对话草稿且只新增一个侧边栏会话行。系统 MUST NOT 在创建失败时清除草稿、项目或团队选择，也 MUST NOT 重复提交并发创建。

### Scenario: 首次发送创建并选中会话
- GIVEN 新对话页已选择项目和团队并填有非空草稿
- WHEN 用户点击发送且创建成功
- THEN 侧边栏恰好新增一个会话行并选中该会话

### Scenario: 创建失败保留输入
- GIVEN 新对话页已选择项目和团队并填有非空草稿
- WHEN 创建请求失败
- THEN 草稿、项目和团队选择保持不变且页面显示可读错误

## Requirement: 验收 4 — 项目菜单可添加项目
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 在 composer 项目菜单列出全部可用项目，并在分隔线后提供“添加项目…”；新项目成功添加后 MUST 立即成为当前新对话项目。系统 MUST NOT 在选择器取消、添加失败或文件夹已绑定活动项目时改变当前选择、清除其他输入或创建重复项目。

### Scenario: 添加项目后立即选中
- GIVEN 新对话页没有选择项目且已填写草稿
- WHEN 用户从项目菜单选择“添加项目…”并在系统选择器中添加新目录成功
- THEN 新项目成为当前项目且原草稿保持不变

### Scenario: 已绑定目录不重复添加
- GIVEN 选择的目录已绑定一个活动项目
- WHEN 用户尝试从新对话页添加该目录
- THEN 当前项目选择保持不变且页面显示目录已被使用

## Requirement: 验收 5 — 创建后标题与项目上下文稳定
Source: docs/product/pages/main-conversation.md#会话内容区

系统 MUST 在首发成功后于时间线滚动容器顶部显示由首条消息生成的、复用统一 46px 窗口 header 高度的不透明 sticky 单行会话标题，标题文字 MUST 在该 header 内自然垂直居中并与消息行文字使用同一条左边界；长标题 MUST 截断且通过 title 属性暴露全文。窗口使用隐藏标题栏时 MUST NOT 为不存在的系统标题栏增加纵向留白。有消息的会话 MUST 保持创建时项目归属。系统 MUST NOT 提供标题编辑入口或有消息会话的项目切换控件。

### Scenario: 已有会话显示稳定标题
- GIVEN 首条消息已创建会话且生成标题
- WHEN 用户查看该会话
- THEN 主内容区与侧边栏显示同一标题且项目切换控件不可用

## Requirement: 验收 19 — 草稿按新对话与会话隔离持久化
Source: docs/product/pages/main-conversation.md#草稿隔离与保留

系统 MUST 独立持久化新对话草稿和每个已有会话的草稿，并在跨会话、跨页面、窗口尺寸变化及应用重启后恢复对应草稿。系统 MUST NOT 因离开新对话页、切换已有会话或创建失败而清除草稿；新对话草稿只能在会话创建且新选择已提交后清除。

### Scenario: 新对话草稿跨重启恢复
- GIVEN 新对话页保存了尚未发送的草稿
- WHEN 应用重启后用户再次打开新对话页
- THEN 输入框恢复该新对话草稿且已有会话草稿未被覆盖

### Scenario: 会话草稿互不覆盖
- GIVEN 两个已有会话分别保存了不同未发送草稿
- WHEN 用户在两会话之间往返切换
- THEN 每个会话恢复自己的草稿

## Requirement: 验收 #5 会话输入区展示四项上下文，只有团队可改选
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 在输入框上方按“项目 → 工作空间 → 分支 → 团队”的固定顺序展示当前会话上下文；会话已有消息时，项目与工作空间 MUST 渲染为不可点击文本，团队 MUST 仍可展开改选。系统 MUST NOT 为已有消息的会话提供改变工作空间的入口，MUST NOT 提供从独立工作空间切回默认工作空间的路径或对应的确认弹层。

### Scenario: 已开始的对话锁定项目与工作空间
- GIVEN 一段已有消息的会话已经绑定项目、工作空间、分支和团队
- WHEN 用户查看输入区上方的上下文条
- THEN 四项按项目、工作空间、分支、团队的顺序出现；项目与工作空间是不可点击文本，只有团队可展开改选

### Scenario: 产品内不存在切回默认工作空间的路径
- GIVEN 一段会话正在使用独立工作空间
- WHEN 用户在会话页寻找改回默认工作空间的方式
- THEN 页面上不存在该入口，也不出现工作空间切换确认弹层

## Requirement: 验收 #8 工作空间在选择处说明边界
Source: docs/product/pages/main-conversation.md#选择工作空间与团队

系统 MUST 在发出第一条消息之前提供工作空间选择，并在选择“独立工作空间”时说明副本基于项目当前所在的提交、不包含尚未提交的改动；非 Git 项目 MUST 在同一菜单内禁用“独立工作空间”并显示不可选原因。系统 MUST NOT 暗示切换会回滚、清理或搬运已经产生的改动，MUST NOT 在对话已经开始后仍提供该选择。

### Scenario: 新对话页选择独立工作空间
- GIVEN 新对话页已选定一个 Git 项目且尚未发出消息
- WHEN 用户选择“独立工作空间”
- THEN 界面说明副本基于项目当前所在的提交且不包含尚未提交的改动

### Scenario: 非 Git 项目解释独立工作空间不可选
- GIVEN 当前选定的项目文件夹不是 Git 仓库
- WHEN 用户打开工作空间菜单
- THEN “独立工作空间”不可选择，且同一菜单内显示“这个项目文件夹不是 git 仓库，无法隔离改动”

## Requirement: 验收 #20 团队菜单披露创建时载入的快照语义
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 允许用户从会话团队菜单改选可用团队，并在菜单内说明“这段对话用的是开始时载入的那份团队内容，之后在 Agent 团队页的修改不影响它”。系统 MUST NOT 让用户把 Agent 团队页的后续编辑误认为会自动改变本会话已载入的团队内容。

### Scenario: 打开团队菜单查看绑定语义
- GIVEN 一段会话已绑定一个可用团队
- WHEN 用户打开团队菜单
- THEN 菜单列出可选团队，并显示创建时载入且不随团队页后续修改变化的说明

## Requirement: #10 时间线不显示过程状态
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 只把对话内容和最终事实放入时间线，并让消息时间仅在悬停或聚焦时显示。系统 MUST NOT 显示「已交棒」「已完成」「运行中」「未开始」等过程标签、过程图标或汇总计数条。

### Scenario: 已结束的步骤只留下对话
- GIVEN 一个成员已经完成当前步骤
- WHEN 用户查看该步骤的历史记录
- THEN 记录中没有过程标签、过程图标、操作条或常驻时间

## Requirement: #11 运行操作条只属于当前步骤
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 在成员工作时实时展示输出并在末尾提供「停下」。系统 MUST NOT 显示计时，且步骤结束后 MUST NOT 在历史中保留操作条。

### Scenario: 当前步骤结束
- GIVEN 时间线正在展示一个成员的实时输出和「停下」
- WHEN 该步骤结束
- THEN 实时操作条整体消失且历史记录中没有计时或停下按钮

## Requirement: #12 四种事实由持久化类型驱动
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 按事件类型分别呈现没跑起来、卡住、用户按停和反复重试仍未成功；没跑起来与卡住 MUST 提供「重试」，另两种 MUST NOT 提供。系统 MUST NOT 把用户按停写成失败或暗示文件改动会被撤销。

### Scenario: 重启后仍可辨认四种事实
- GIVEN 一段对话已经持久化四种事件类型
- WHEN 页面刷新或桌面应用重启后重新打开该对话
- THEN 四种事实仍分别可见且只有没跑起来和卡住带「重试」

## Requirement: #13 所有对话文本过滤机器信息
Source: docs/product/pages/main-conversation.md#指标与验收

系统 MUST 过滤 Agent 正文、运行步骤标题、实时摘要和系统记录中的路径、cwd、runDir、数据库路径及内部 id。系统 MUST NOT 过滤项目修复确认框中由用户亲自选择的文件夹路径。

### Scenario: Agent 输出绝对路径
- GIVEN Agent 正文和步骤标题包含绝对路径与内部运行 id
- WHEN 时间线渲染这些文本
- THEN 用户只能看到替代文案而看不到路径或内部 id

## Requirement: #16 状态点只取确定事实
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 按红大于蓝大于闪的优先级派生状态点：红点来自三种未处理异常或三种不可继续状态，蓝点来自无人工作、最后消息未提及成员且结果未读，闪点来自成员正在工作。系统 MUST NOT 以用户按停、正常完成、最后消息已提及成员或旧「等人回话」字段触发红点或蓝点；每个红点 MUST 对应时间线中的可读系统记录。

### Scenario: 停下不会召回用户
- GIVEN 用户按停后没有其他异常且最后结果已查看
- WHEN 侧边栏渲染该会话和所属项目
- THEN 会话行与项目聚合行都不显示红点

## Requirement: #17 三种不可继续状态共用只读表现
Source: docs/product/pages/main-conversation.md#三种不可继续状态的共同规则

系统 MUST 对项目文件夹不可用、团队已删除、团队需要修复统一禁用输入和发送、保持历史只读并标红对应上下文控件。系统 MUST NOT 混淆三种原因或恢复动作，恢复条件满足后 MUST 恢复输入能力。

### Scenario: 已删除团队改选后恢复
- GIVEN 当前团队已删除且对话处于只读态
- WHEN 用户改选一支可用团队
- THEN 输入与发送恢复且既有时间线保持不变

## Requirement: 子会话以时间线卡片呈现且不进入侧边栏
Source: docs/product/pages/main-conversation.md#子会话卡片

系统 MUST 在父会话时间线的拆分锚点处呈现子会话卡片，每行 MUST 显示子任务标题、负责成员和运行时给出的当前状态，且整行可打开对应子会话。系统 MUST NOT 在侧边栏呈现带父会话的会话、lineage 文案或由界面自行推导的子任务状态。

### Scenario: 拆分结果只有一个聚合入口
- GIVEN 父会话已拆出两个状态不同的子会话
- WHEN 主会话页同时呈现时间线和侧边栏
- THEN 时间线卡片含两行任务、成员、状态，侧边栏只含父会话

## Requirement: 子会话在右侧展开区外壳中打开
Source: docs/product/pages/main-conversation.md#子会话卡片

系统 MUST 在宽窗口右侧打开所选子会话、标记所选卡片行、保持父会话及其输入框可达，并在关闭后恢复打开前的父时间线滚动位置。系统 MUST NOT 在本外壳中新增输入方式或操作集。

### Scenario: 父会话更新后关闭展开区
- GIVEN 用户从父时间线中部打开了一个子会话
- WHEN 展开期间父会话收到新消息且用户关闭展开区
- THEN 父会话仍显示在打开前的滚动位置，展开区内只复用既有会话视图

## Requirement: 窄窗按固定顺序收敛会话上下文
Source: docs/product/pages/main-conversation.md#响应式与窗口行为

系统 MUST 在窗口变窄时按分支、工作空间、团队、项目的顺序逐项隐藏上下文，并让子会话展开区覆盖整个主内容区。系统 MUST NOT 在团队或项目仍需显示的宽度先隐藏它们而保留分支或工作空间。

### Scenario: 从宽窗缩到最窄
- GIVEN 会话上下文在宽窗显示项目、工作空间、分支、团队
- WHEN 窗口依次跨过每个收敛阈值
- THEN 可见项依次变为项目工作空间团队、项目团队、仅项目、全部隐藏，子会话展开区在窄窗为全覆盖

## Requirement: 父时间线保持可控跟随
Source: docs/product/pages/main-conversation.md#响应式与窗口行为

系统 MUST 只把时间线作为页面主要滚动区域；用户位于底部时 MUST 跟随新内容，用户向上翻阅时 MUST 保持位置并提供回到底部入口，可见的代码或命令输出 MUST 在自身容器内横向滚动。系统 MUST NOT 让长文本或命令输出撑宽页面，也 MUST NOT 让分栏遮断页面标题和父会话输入框。

### Scenario: 向上阅读时收到新内容
- GIVEN 用户已离开父时间线底部
- WHEN 父会话出现新内容
- THEN 时间线保持用户当前阅读位置并显示回到底部入口
