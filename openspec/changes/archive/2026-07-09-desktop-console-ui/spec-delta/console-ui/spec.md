# console-ui spec delta：desktop-console-ui

## 新增行为规则
- MUST provide a workspace package named `@agent-moebius/console-ui` under `packages/console-ui`.
- MUST expose React components and global styles so a future desktop renderer can import `@agent-moebius/console-ui` and `@agent-moebius/console-ui/globals.css`.
- MUST use shadcn-style source components built on Tailwind CSS variables and Radix primitives, with component source checked into this repository rather than hidden behind a runtime UI package.
- MUST keep `packages/console-ui/src/styles/tokens.css` as the package-local near-monochrome token source: neutral surfaces and text dominate, indigo is limited to interactive emphasis, green/red are reserved for verdict and danger facts, and waiting-for-human states use neutral structural signals instead of a dedicated hue.
- MUST map core shadcn semantic variables (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, `--ring`) onto the console token variables in `globals.css`.
- MUST provide Storybook as the development-time browser showcase for console UI components.
- MUST include at least one shadcn-style primitive sample and one project-specific composite sample so the token chain, Storybook setup, and renderer-consumable package shape are verified before the full desktop console app exists.
- MUST keep `component-library/` as a Tailwind HTML visual reference only; the reusable React component package lives in `packages/console-ui`.
- MUST keep `console-ui` free of runner, observer, GitHub, Codex, `.state`, and IPC dependencies. Real desktop console app state management, renderer bundling, IPC, and runner/state-file integration are out of scope for this change.

## 场景新增
### 场景 CUI.1：未来 renderer 可消费组件库
Given a future desktop renderer needs console UI components
When it adds `@agent-moebius/console-ui` as a workspace dependency
Then it can import React components from `@agent-moebius/console-ui`
And it can import near-monochrome global styles from `@agent-moebius/console-ui/globals.css`

### 场景 CUI.2：Storybook 展示组件样板
Given a developer runs `pnpm --filter @agent-moebius/console-ui storybook`
When Storybook starts
Then the browser showcase includes a primitive button story
And it includes a project-specific acceptance card story
And both stories use the same near-monochrome token variables.

### 场景 CUI.3：等你状态不用专属色相
Given an acceptance card is rendered for a waiting-for-human review
When the component is inspected
Then the card remains a neutral surface with neutral waiting iconography
And pass/fail verdicts use colored text only
And the submit action uses indigo as an interaction color rather than a waiting-state color.
