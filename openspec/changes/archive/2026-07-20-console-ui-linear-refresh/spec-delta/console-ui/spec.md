# console-ui delta：console-ui-linear-refresh

## ADDED Requirements

### Requirement: Design language governance

The `console-ui` package MUST keep `packages/console-ui/DESIGN.md` as the package-local design language fact source covering token usage discipline, typography rules, icon rules, status semantics and hue budget, elevation/focus/motion rules, and a catalog of component patterns pointing at the component source files that implement them.

New or modified components under `packages/console-ui` MUST compose the tokens, status semantics, and patterns recorded in `packages/console-ui/DESIGN.md` rather than introducing ad-hoc visual values; when a genuinely new pattern is introduced, the same change MUST add it to `packages/console-ui/DESIGN.md`.

`DESIGN.md` MUST record its external design references by link and attribution only, and MUST NOT vendor third-party design specification content.

#### Scenario: New component follows the design language

- **GIVEN** a developer adds a new console UI component
- **WHEN** the component and `DESIGN.md` are inspected
- **THEN** the component composes existing tokens and status semantics without hard-coded visual values
- **AND** any pattern not previously cataloged has been added to `DESIGN.md` in the same change.

## MODIFIED Requirements

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
