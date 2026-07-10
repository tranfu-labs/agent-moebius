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
- MUST keep Storybook under `packages/console-ui` as the only shipped browser showcase for this domain.
- MUST NOT keep a parallel static Tailwind HTML component library as a second UI source of truth.

### 近单色令牌
- MUST keep `packages/console-ui/src/styles/tokens.css` as the package-local near-monochrome token source: neutral surfaces and text dominate, indigo is limited to interactive emphasis, green/red are reserved for verdict and danger facts, and waiting-for-human states use neutral structural signals instead of a dedicated hue.
- MUST map core shadcn semantic variables (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, `--ring`) onto the console token variables in `globals.css`.
- MUST render waiting-for-human review surfaces as neutral surfaces with neutral waiting iconography; pass/fail verdicts use colored text only, and the submit action uses indigo as an interaction color rather than a waiting-state color.

### 禁止依赖
- MUST keep `console-ui` free of runner, observer, GitHub, Codex, `.state`, and IPC dependencies.
- MUST NOT implement real desktop console app state management, renderer bundling, IPC, or runner/state-file integration in this domain; those belong to a later desktop console app change.

### T4 桌面操作台展示组件
- MUST provide presentational React components for the local operator console: project/session sidebar, session timeline, user/agent/system message rows, run live block, local error/interrupted/stuck records, message composer, and diagnostic action affordances.
- MUST keep operator console components controlled by props and callbacks supplied by the desktop renderer.
- MUST render running states with a non-empty summary, elapsed time or runDir evidence, and an interrupt action when `interruptible` is true.
- MUST render interrupted and stuck runs distinctly from failed runs; interrupted runs must use neutral status styling, stuck runs must be visibly marked as stuck, and failed runs must use danger fact styling.
- MUST render failed local errors visibly with reason and runDir when available.
- MUST support a single local project with multiple sessions while preserving the project -> session visual hierarchy.
- MUST render tail-read fallback or diagnostic copy without leaving the run live block blank.

### T5 父子会话侧栏树
- MUST render sessions as a project -> parent session -> child session tree when parent session ids are available.
- MUST keep root session selection and child session selection controlled by the same selected session id.
- MUST restore the same parent-child tree after refresh from session summary data alone.
- MUST keep child session rows compact, indented, and scannable with title and status visible.
- MUST render child sessions with missing parent summaries as visible root fallback rows rather than dropping them.
- MUST render each session at most once even when parent session references are cyclic, self-referential, or otherwise corrupt.
- MUST bound parent tree construction so corrupt parent references cannot hang rendering.

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

### 场景 CUI.T4.1：运行直播块非空
Given a run live block receives a running snapshot with no parseable output
When it renders
Then it displays a deterministic running summary
And it displays elapsed time or runDir evidence
And it does not render an empty card.

### 场景 CUI.T4.2：中断、卡住与失败视觉分流
Given one timeline record is interrupted
And another timeline record is stuck
And another timeline record is failed
When the timeline renders
Then the interrupted record uses neutral status styling
And the stuck record is visibly marked as stuck without being styled as a user interruption
And the failed record uses danger fact styling
And their labels are distinguishable.

### 场景 CUI.T4.3：单项目多会话侧栏
Given a local project has sessions with running, stuck, failed, and idle states
When the sidebar renders
Then it shows the project row
And it shows all sessions under the project
And the running, stuck, and failed sessions have visible state indicators.

### 场景 CUI.T5.1：侧栏渲染持久化子会话
Given a project has a parent session and two child sessions whose `parentSessionId` references the parent
When the operator console sidebar renders
Then the two child sessions appear under the parent session
And selecting a child session calls the normal session selection callback with that child session id.

### 场景 CUI.T5.2：刷新保持树形层级
Given the operator console receives the same flat session summaries after a renderer refresh
When the sidebar renders again
Then the child sessions still appear under the same parent session
And their order and selected state remain stable.

### 场景 CUI.T5.3：损坏 parent 链仍有限可见
Given flat session summaries contain a parent cycle or self-parent reference
When the operator console sidebar renders
Then rendering completes
And each session appears at most once
And sessions that cannot be safely attached are shown as root fallback rows.
