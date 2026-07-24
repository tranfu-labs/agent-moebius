# console-ui spec delta：local-console-t4-desktop-operator-console

T4 extends `@moebius/console-ui` from foundation samples to the presentational components needed by the desktop operator console. Data fetching, IPC, SQLite, Codex, GitHub, and runner control remain outside the package.

## 新增行为规则

- MUST provide presentational React components for the T4 operator console: project/session sidebar, session timeline, user/agent/system message rows, run live block, local error/interrupted/stuck records, message composer, and diagnostic action affordances.
- MUST keep these components controlled by props and callbacks supplied by the desktop renderer.
- MUST render running states with a non-empty summary, elapsed time or runDir evidence, and an interrupt action when `interruptible` is true.
- MUST render interrupted and stuck runs distinctly from failed runs; interrupted runs must not use danger styling, and stuck runs must be visibly different from both running and failed.
- MUST render failed local errors visibly with reason and runDir when available.
- MUST support a single local project with multiple sessions while preserving the project -> session visual hierarchy.
- MUST render tail-read fallback or diagnostic copy without leaving the run live block blank.
- MUST keep the near-monochrome token rules: neutral structure dominates, indigo is interaction emphasis, red is reserved for failure/danger facts, and interrupted/user-waiting states use neutral structure.
- MUST NOT import Electron, runner, Codex, GitHub, SQLite, `.state`, or local console store modules.

## 新增场景

### 场景 CUI-T4.1：运行直播块非空
Given a run live block receives a running snapshot with no parseable output
When it renders
Then it displays a deterministic running summary
And it displays elapsed time or runDir evidence
And it does not render an empty card.

### 场景 CUI-T4.2：中断、卡住与失败视觉分流
Given one timeline record is interrupted
And another timeline record is stuck
And another timeline record is failed
When the timeline renders
Then the interrupted record uses neutral status styling
And the stuck record is visibly marked as stuck without being styled as a user interruption
And the failed record uses danger fact styling
And their labels are distinguishable.

### 场景 CUI-T4.3：单项目多会话侧栏
Given a local project has sessions with running, stuck, failed, and idle states
When the sidebar renders
Then it shows the project row
And it shows all sessions under the project
And the running, stuck, and failed sessions have visible state indicators.
