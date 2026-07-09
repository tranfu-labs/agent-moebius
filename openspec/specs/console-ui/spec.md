# console-ui 规格

## 域定位
`console-ui` 是桌面对话操作台的 React 组件库与开发期展示台。它提供可被未来 Electron renderer 直接消费的 shadcn 风格源码组件、Radix 无障碍原语封装、Tailwind 近单色令牌和项目专属复合组件；它不承载真实桌面对话操作台的数据流、IPC、runner 状态管理或 GitHub / Codex 调用。

## 业务规则

### 包与消费边界
- MUST provide a workspace package named `@agent-moebius/console-ui` under `packages/console-ui`.
- MUST expose React components and global styles so a future desktop renderer can import `@agent-moebius/console-ui` and `@agent-moebius/console-ui/globals.css`.
- MUST use shadcn-style source components built on Tailwind CSS variables and Radix primitives, with component source checked into this repository rather than hidden behind a runtime UI package.
- MUST provide Storybook as the development-time browser showcase for console UI components.
- MUST include at least one shadcn-style primitive sample and one project-specific composite sample so the token chain, Storybook setup, and renderer-consumable package shape are verified before the full desktop console app exists.
- MUST keep `component-library/` as a Tailwind HTML visual reference only; the reusable React component package lives in `packages/console-ui`.

### 近单色令牌
- MUST keep `packages/console-ui/src/styles/tokens.css` as the package-local near-monochrome token source: neutral surfaces and text dominate, indigo is limited to interactive emphasis, green/red are reserved for verdict and danger facts, and waiting-for-human states use neutral structural signals instead of a dedicated hue.
- MUST map core shadcn semantic variables (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, `--ring`) onto the console token variables in `globals.css`.
- MUST render waiting-for-human review surfaces as neutral surfaces with neutral waiting iconography; pass/fail verdicts use colored text only, and the submit action uses indigo as an interaction color rather than a waiting-state color.

### 禁止依赖
- MUST keep `console-ui` free of runner, observer, GitHub, Codex, `.state`, and IPC dependencies.
- MUST NOT implement real desktop console app state management, renderer bundling, IPC, or runner/state-file integration in this domain; those belong to a later desktop console app change.

## 场景

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
