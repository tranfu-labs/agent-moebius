# console-ui delta：console-ui-flat-anchor

## ADDED Requirements

### Requirement: Flat Card and status Badge baseline
The console UI component library MUST keep `Card` as a flat container baseline with thin border, neutral surface, no default shadow, and square or near-square radius.

The console UI component library MUST NOT make `Card` default to a floating or soft-card appearance.

The console UI component library MUST expose `Badge` variants as runtime status semantics instead of generic visual names.

The `Badge` status semantics MUST cover running, failed, waiting, interrupted, idle, pending, completed, displayed, and stuck states used by the operator console.

The `Badge` component MUST NOT retain `neutral`, `selected`, `accent`, `pass`, or `danger` as compatibility aliases.

The `Badge` component MUST reserve pass/fail verdict coloring for acceptance verdict surfaces rather than mapping ordinary completed or displayed runtime states to verdict semantics.

#### Scenario: Storybook shows flat primitives
Given a developer runs `pnpm --filter @moebius/console-ui storybook`
When the Card and Badge stories render
Then Card appears as a flat thin-border surface
And Badge stories use status semantic variants
And the stories do not show a separate floating component-library visual language.

### Requirement: Operator console reuses Card and Badge
The operator console main content MUST render run live blocks and timeline messages through the shared `Card` component.

The operator console main content MUST render session and message status labels through the shared `Badge` component.

The operator console main content MUST NOT keep a parallel card or badge implementation using native `article`, native status `span`, or hand-written `border border-line` card/badge containers.

The operator console MUST keep project and session sidebar rows as navigation controls rather than card surfaces.

#### Scenario: Main content has no hand-written card or badge shell
Given `packages/console-ui/src/console/operator-console.tsx` has been updated
When the main content region is searched for `border border-line` and `<article`
Then the search returns no card or badge shell matches
And the project/session sidebar navigation remains compact and selectable.

#### Scenario: Runtime states remain distinguishable
Given the operator console renders running, waiting, failed, stuck, interrupted, idle, completed, pending, and displayed states
When the user scans the header, live run block, and timeline
Then each state has a visible status label
And failed or stuck states are visually distinct from interrupted states
And waiting or pending states use neutral structural styling.
