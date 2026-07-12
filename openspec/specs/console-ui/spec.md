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

### Requirement: Near-monochrome token system

The `console-ui` package MUST keep `packages/console-ui/src/styles/tokens.css` as the package-local near-monochrome token source: neutral surfaces and text dominate, indigo is limited to interactive emphasis, green/red are reserved for verdict and danger facts, and waiting-for-human states use neutral structural signals instead of a dedicated hue.

The `console-ui` package MUST map core shadcn semantic variables (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, `--ring`) onto the console token variables in `globals.css`.

The `console-ui` package MUST render waiting-for-human review surfaces as neutral surfaces with neutral waiting iconography.

The `console-ui` package MUST render pass/fail verdicts using colored text only.

The `console-ui` package MUST render submit actions using indigo as an interaction color rather than a waiting-state color.

#### Scenario: Waiting-for-human state stays neutral

- **GIVEN** an acceptance card is rendered for a waiting-for-human review
- **WHEN** the component is inspected
- **THEN** the card remains a neutral surface with neutral waiting iconography, pass/fail verdicts use colored text only, and the submit action uses indigo as an interaction color.

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

The operator console MUST support a single local project with multiple sessions while preserving the project to session visual hierarchy.

The operator console MUST render tail-read fallback or diagnostic copy without leaving the run live block blank.

#### Scenario: Run live block is non-empty

- **GIVEN** a run live block receives a running snapshot with no parseable output
- **WHEN** it renders
- **THEN** it displays a deterministic running summary, elapsed time or runDir evidence, and no empty card.

#### Scenario: Interrupted, stuck, and failed states are distinct

- **GIVEN** one timeline record is interrupted, another timeline record is stuck, and another timeline record is failed
- **WHEN** the timeline renders
- **THEN** the interrupted record uses neutral status styling, the stuck record is visibly marked as stuck, and the failed record uses danger fact styling.

#### Scenario: Single project supports multiple sessions

- **GIVEN** a local project has sessions with running, stuck, failed, and idle states
- **WHEN** the sidebar renders
- **THEN** it shows the project row, all sessions under the project, and visible state indicators for running, stuck, and failed sessions.

### Requirement: Flat session rail with persisted lineage

The operator console MUST render every session under a project as a flat peer list even when persisted session summaries contain `parentSessionId`.

Runtime lineage MUST NOT produce indentation, tree connectors, expand/collapse controls, child-count summaries, or parent breadcrumbs in the primary console.

The operator console MUST keep every session controlled by the same selected session id and MUST restore the selected session after refresh.

The operator console MUST render each session at most once even when parent session references are missing, cyclic, self-referential, or otherwise corrupt.

#### Scenario: Derived sessions remain peers

- **GIVEN** a project has an original session and derived sessions whose `parentSessionId` references the original
- **WHEN** the operator console sidebar renders
- **THEN** every session uses the same row indentation and selection model
- **AND** no tree connector, expand control, child summary, or parent breadcrumb is shown.

#### Scenario: Corrupt lineage stays bounded and visible

- **GIVEN** flat session summaries contain a parent cycle, self-parent reference, or missing parent reference
- **WHEN** the operator console sidebar renders
- **THEN** rendering completes and each session appears exactly once as a peer row.

### Requirement: Flat Card and status Badge baseline

The shared `Card` primitive MUST remain a flat container baseline with thin border, neutral surface, no default shadow, and square or near-square radius.

The shared `Card` primitive MUST NOT default to a floating or soft-card appearance.

The shared `Badge` primitive MUST expose variants as runtime status semantics instead of generic visual names.

The shared `Badge` primitive MUST cover `running`, `failed`, `waiting`, `interrupted`, `idle`, `pending`, `completed`, `displayed`, and `stuck` as status semantics used by the operator console.

The shared `Badge` primitive MUST NOT retain `neutral`, `selected`, `accent`, `pass`, or `danger` as compatibility aliases.

The shared `Badge` primitive MUST reserve pass/fail verdict coloring for acceptance verdict surfaces rather than mapping ordinary completed or displayed runtime states to verdict semantics.

#### Scenario: Storybook shows flat primitives

- **GIVEN** a developer runs `pnpm --filter @agent-moebius/console-ui storybook`
- **WHEN** the Card and Badge stories render
- **THEN** Card appears as a flat thin-border surface, Badge stories use status semantic variants, and the stories do not show a separate floating component-library visual language.

### Requirement: Codex-native single-stream operator console

The operator console MUST use a Codex-desktop-style two-column frame consisting of an integrated project/session rail and one conversation canvas with a bottom composer.

The default conversation surface MUST NOT render a session header toolbar, aggregate passed/running/waiting counters, a persistent diagnostics button, a persistent worktree toggle, or expandable raw machine data.

User, agent, and system records MUST appear in one chronological stream. Agent identity MUST use a compact localized role avatar, name, and inline state metadata rather than separate agent columns or floating message cards.

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
- **THEN** replies appear in timestamp order in the same canvas with distinct localized role identities
- **AND** no per-agent panel or dashboard is created.

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
