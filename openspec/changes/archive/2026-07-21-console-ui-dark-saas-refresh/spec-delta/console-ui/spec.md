# console-ui delta：console-ui-dark-saas-refresh

## MODIFIED Requirements

### Requirement: Token system with status hue family

Source: docs/product/prd.md#视觉语言原则

The `console-ui` package MUST keep `packages/console-ui/src/styles/tokens.css` as the package-local token source: cool-tinted neutral surfaces and text dominate, indigo `#5E6AD2` is the single interaction accent in both light and dark themes, and green/red remain reserved for verdict and danger facts.

The token source MUST define a status hue family for runtime status pills — amber for running, blue for pending, violet for waiting, and a neutral tint — with foreground, tinted background, and same-hue border values defined for BOTH light and dark themes in the same change.

The token source MUST define the dark canvas near `#0A0B0D` with card surfaces near `#15161A` and visibly stronger borders than the previous near-monochrome baseline, and MUST set the corner-radius base token to 14px with derived steps computed from it.

The token source MUST define a per-theme accent hover color (`#4B57C8` darker in light, `#828FFF` brighter in dark), a multi-layer popover shadow token, a double-layer indigo focus ring token, and motion tokens (150ms default duration with an easeOutQuad-style curve, plus a slower entrance curve).

The `console-ui` package MUST map core shadcn semantic variables (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, `--ring`) onto the console token variables in `globals.css`.

A red unread-count badge MAY use the danger hue as the single registered exception to verdict/danger exclusivity; all other uses of green/red outside verdict, danger, and this exception MUST NOT be introduced.

#### Scenario: Interactive accent stays indigo in both themes

- **GIVEN** the token source loads in light or dark theme
- **WHEN** an interactive accent, hover, or focus ring renders
- **THEN** the accent is `#5E6AD2` in both themes, hover moves to `#4B57C8` in light and `#828FFF` in dark, and focus rings use the double-layer indigo token.

#### Scenario: Status hue family exists in both themes

- **GIVEN** the token source loads
- **WHEN** running, pending, and waiting status pills render in either theme
- **THEN** each uses its own hue family (amber / blue / violet) with foreground, tinted background, and same-hue border tokens defined for that theme
- **AND** no status hue token is defined for only one theme.

### Requirement: Status pill Badge baseline

Source: docs/product/prd.md#视觉语言原则

The shared `Card` primitive MUST remain a thin-border neutral surface without default shadows, using the 14px radius baseline and visibly bordered dark surfaces.

The shared `Badge` primitive MUST expose variants as runtime status semantics instead of generic visual names, and MUST render every variant as a status pill: a 12px status icon plus text on a tinted background with a same-hue border and fully rounded shape.

The shared `Badge` primitive MUST cover `running`, `failed`, `waiting`, `interrupted`, `idle`, `pending`, `completed`, `displayed`, and `stuck` as status semantics used by the operator console, plus `pass` for verdict surfaces, with icon and hue following status semantics: half-pie amber for running, clock blue for pending, hollow-circle violet for waiting, dashed-circle neutral for interrupted and idle, filled-disc neutral tint for completed and displayed, crossed-circle danger for failed and stuck, and checked-circle pass green for verdict pass.

The shared `Badge` primitive MUST NOT retain `neutral`, `selected`, `accent`, or `danger` as compatibility aliases.

The shared `Badge` primitive MUST reserve pass/fail verdict coloring for acceptance verdict surfaces rather than mapping ordinary completed or displayed runtime states to verdict semantics.

#### Scenario: Badge stories show status pills

- **WHEN** the Card and Badge stories render
- **THEN** Card appears as a thin-border surface on the new radius baseline, and Badge stories show every status semantic variant as an icon-plus-text pill with its hue family.

## RENAMED Requirements

- FROM: `### Requirement: Near-monochrome token system`
  TO: `### Requirement: Token system with status hue family`
- FROM: `### Requirement: Flat Card and status Badge baseline`
  TO: `### Requirement: Status pill Badge baseline`
