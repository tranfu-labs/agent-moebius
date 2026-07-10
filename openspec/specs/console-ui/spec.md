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

### Requirement: Parent-child session sidebar tree

The operator console MUST render sessions as a project to parent session to child session tree when parent session ids are available.

The operator console MUST keep root session selection and child session selection controlled by the same selected session id.

The operator console MUST restore the same parent-child tree after refresh from session summary data alone.

The operator console MUST keep child session rows compact, indented, and scannable with title and status visible.

The operator console MUST render child sessions with missing parent summaries as visible root fallback rows rather than dropping them.

The operator console MUST render each session at most once even when parent session references are cyclic, self-referential, or otherwise corrupt.

The operator console MUST bound parent tree construction so corrupt parent references cannot hang rendering.

#### Scenario: Sidebar renders persisted child sessions

- **GIVEN** a project has a parent session and two child sessions whose `parentSessionId` references the parent
- **WHEN** the operator console sidebar renders
- **THEN** the two child sessions appear under the parent session and selecting a child session calls the normal session selection callback with that child session id.

#### Scenario: Refresh keeps tree hierarchy

- **GIVEN** the operator console receives the same flat session summaries after a renderer refresh
- **WHEN** the sidebar renders again
- **THEN** the child sessions still appear under the same parent session and their order and selected state remain stable.

#### Scenario: Corrupt parent chains stay bounded and visible

- **GIVEN** flat session summaries contain a parent cycle or self-parent reference
- **WHEN** the operator console sidebar renders
- **THEN** rendering completes, each session appears at most once, and sessions that cannot be safely attached are shown as root fallback rows.

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

### Requirement: Operator console reuses Card and Badge

The operator console main content MUST render run live blocks and timeline messages through the shared `Card` component.

The operator console main content MUST render session and message status labels through the shared `Badge` component.

The operator console main content MUST NOT keep a parallel card or badge implementation using native `article`, native status `span`, or hand-written `border border-line` card/badge containers.

The operator console MUST keep project and session sidebar rows as navigation controls rather than card surfaces.

#### Scenario: Main content has no hand-written card or badge shell

- **GIVEN** `packages/console-ui/src/console/operator-console.tsx` has been updated
- **WHEN** the main content region is searched for `border border-line` and `<article`
- **THEN** the search returns no card or badge shell matches and the project/session sidebar navigation remains compact and selectable.

#### Scenario: Runtime states remain distinguishable

- **GIVEN** the operator console renders running, waiting, failed, stuck, interrupted, idle, completed, pending, and displayed states
- **WHEN** the user scans the header, live run block, and timeline
- **THEN** each state has a visible status label, failed or stuck states are visually distinct from interrupted states, and waiting or pending states use neutral structural styling.
