# desktop-shell 规格

## 域定位
`desktop-shell` 负责把 runner 与 observer 装配成一个纯本地桌面应用（Electron 壳）：启动应用即启动当前全部功能，直接调用本机 codex CLI 与 gh CLI。壳层只做装配、子进程监管、环境自检与更新提示，不承载任何业务规则；runner 行为事实源在 `github-issue-runner`，本地操作台与 observer 呈现事实源在 `local-console`，目标账本事实源在 `goal-ledger`。终端形态（`pnpm start` / `pnpm observer`）继续有效且行为不变。

## 业务规则

### Team record location independent of team id

- MUST record a user team's on-disk location as a value distinguishable between a managed directory under `<dataRoot>/teams/` and an arbitrary absolute path outside it.
- MUST keep the team id stable across relocation, and MUST NOT derive a user team's directory from its id.
- MUST resolve every user-team path — member reads and writes, file-manager reveal, and external-change detection — through the recorded location.
- MUST continue resolving built-in teams by id under `.system/`, since built-in teams cannot be relocated.
- MUST read records written by the previous document version as managed directories, without user intervention.
- MUST NOT cache member display names or descriptions in the team record, including for the needs-repair state.
- MUST retain the team name and one-line description in the record so a team whose directory is unavailable remains identifiable.

#### Scenario: Relocated team stays reachable

- **GIVEN** a user team has been relocated to a directory outside `<dataRoot>/teams/`
- **WHEN** the user reveals that team in the file manager, and the app checks one of its members for external modification
- **THEN** both operations resolve to the relocated directory
- **AND** neither falls back to a path derived from the team id.

#### Scenario: Records from the previous version keep working

- **GIVEN** a team record was written before this change and stores only a directory name
- **WHEN** the app loads team records
- **THEN** the record resolves to that directory under `<dataRoot>/teams/`
- **AND** the team's id, name, and description are unchanged.

#### Scenario: Unavailable team is identifiable without a cached roster

- **GIVEN** a recorded user team whose directory is unreadable
- **WHEN** the team list renders that team
- **THEN** its name and description come from the record
- **AND** no member name or member count is shown.

### Session-scoped agent roster injection

- MUST inject, when starting the local console server, a roster resolver that answers with the agent set applicable to a given session.
- MUST resolve that set from the members of the team bound to the session, using the recorded team location.
- MUST fall back to the shared `<dataRoot>/agents/` directory when the session has no bound team.
- MUST fail with an explicit error, rather than an empty roster, when the bound team needs repair.
- MUST NOT move knowledge of the `teams/` layout into the local console server itself.

#### Scenario: Bound session sees only its team

- **GIVEN** a session is bound to a team with three members
- **WHEN** the runtime resolves the agents available to that session
- **THEN** the result is exactly those three members
- **AND** agents present only in the shared `agents/` directory are absent.

#### Scenario: Broken team is reported, not silently empty

- **GIVEN** a session is bound to a team that needs repair
- **WHEN** the runtime resolves the agents available to that session
- **THEN** an explicit error identifies the team as needing repair
- **AND** the failure is not presented as the session having no agents.

### 启动与退出
- MUST 启动应用即依次完成：数据根解析 → PATH 修复 → 首启种子拷贝 → 环境自检 → 启动 observer 服务 → 启动 main 进程拥有的 local console server → 派生 runner 子进程 → 打开操作台主窗口。
- MUST 持有单实例锁：第二个应用实例启动时激活已有窗口后退出，NEVER 出现两个实例同时派生 runner 或并发写 `.state/`。
- MUST 在种子拷贝失败时不派生 runner 子进程，并把失败原因呈现在状态页；NEVER 让 runner 在缺失 `config.toml` 的数据根上静默启动失败。
- MUST 在关闭主窗口时先停止 runner 子进程（温和信号，超时后强杀）、再关闭 local console server 与 observer，然后退出应用；NEVER 留下孤儿子进程。
- MUST 让环境自检失败（codex 缺失、gh 未登录等）只体现在操作台诊断状态与辅助状态页，NEVER 阻断应用启动。

### 数据根
- MUST 打包态数据根默认为 `~/.agent-moebius`，开发态默认为仓库根；`AGENT_MOEBIUS_DATA_ROOT` 环境变量为最高优先级覆盖。
- MUST 把 runner 子进程工作目录设为数据根，使 `.state/` 等相对路径状态文件落在数据根下。
- MUST 在打包态为 runner 子进程注入 `AGENT_MOEBIUS_WORKDIR_ROOT=<数据根>/workdir`，NEVER 让 workdir 按默认规则落在应用包附近。
- MUST 首启把 `agents/`（含 `ceo-scripts/`）与示例 `config.toml` 种子拷贝到数据根；已存在的文件 NEVER 覆盖。
- MUST 保持 `src/config.ts` 在未设置数据根环境变量时行为与终端形态完全一致。

### observer 边界
- MUST 在壳内以 `127.0.0.1` + 动态端口启动 observer，并把实际端口呈现在状态页。
- MUST 保持 observer 只读旁路语义：壳层 NEVER 给 observer 增加写接口、操作按钮或 runner 控制能力；启停 runner 属于壳层主进程能力。

### 操作台主窗口
- MUST load the desktop operator console as the default BrowserWindow content after application boot.
- MUST use an integrated hidden-inset titlebar for the macOS main window so traffic-light controls visually belong to the console rail; Windows/Linux MUST keep usable native window controls.
- MUST provide a safe renderer drag region for the integrated main window while keeping interactive controls usable.
- MUST keep status and observer diagnostics reachable from the operator console, but they must not be the default main-window experience.
- MUST expose the local console server URL or equivalent local API capability to the renderer through preload, not through global Node integration.
- MUST keep context isolation enabled and node integration disabled for renderer windows.
- MUST keep the status page available as an auxiliary diagnostic window.
- MUST expose a narrow preload IPC that opens the native directory picker and returns only the selected folder path or null to the renderer.
- MUST NOT write project rows, edit configuration, start Codex, call GitHub, or call `gh` inside the folder picker IPC.
- MUST let the renderer persist the selected folder as a project through the loopback local console API rather than direct filesystem or SQLite access.

### local console server ownership
- MUST ensure desktop mode starts exactly one local console server for the operator console.
- SHOULD let the Electron main process own the local console server lifecycle so renderer reloads do not destroy active local runs.
- MUST prevent the runner child from starting a duplicate local console server when the desktop main process already owns it.
- MUST close the local console server during desktop shutdown along with runner and observer.

### runner 子进程监管
- MUST 用显式状态机监管 runner 子进程：停止 / 启动中 / 运行中 / 已崩溃。
- MUST 在子进程异常退出后按退避策略自动重启；连续崩溃达上限（3 次）后停住并在状态页呈现失败原因与日志位置。
- MUST 把壳层主动停止（退出收尾）与异常退出区分开：主动停止 NEVER 触发自动重启。
- MUST 捕获 runner 子进程的 stdout/stderr 并落盘到数据根 `logs/` 下（按启动分文件），供崩溃排查；日志写入失败 NEVER 中断 runner 运行。

### 环境自检与 PATH
- MUST 探测 codex 可执行、gh 可执行与 gh 登录态，并以结构化结果渲染到状态页。
- MUST 在 macOS 图形进程内做 PATH 修复（合并登录 shell 的 PATH）；读取失败时保底沿用原 PATH。

### 更新
- MUST 按平台分支更新策略：Windows/Linux 通过 electron-updater 对接 GitHub Releases 自动更新；macOS 在无签名证书期间「检查更新 → 有新版则跳转下载页」。
- MUST 把版本比较与平台分支决策保持为纯逻辑模块。

### 架构约束
- MUST 把壳层业务逻辑（数据根解析、种子拷贝计划、自检解析、子进程状态机、更新分支）拆为不依赖 Electron 运行时的纯模块并配单元测试；装配层 NEVER 承载业务规则。
- MUST 限定 preload IPC 为窄口：状态快照推送、local console URL、打开诊断状态页、打开观察页、打开数据目录、检查更新；NEVER 暴露配置写接口。
- MUST NOT 把 runner / observer 的行为规则复制进本域；本域只引用它们的编程入口（`start()`、`startObserverServer()`）。

## 场景

### 场景 DS.T4.1：主窗口默认是操作台
Given the desktop app has finished booting
When the main BrowserWindow finishes loading
Then it displays the local operator console
And the user can reach status/observer diagnostics from an auxiliary action.

### 场景 DS.T4.2：桌面形态只有一个 local console server
Given desktop main process starts a local console server
When runner child starts
Then runner child does not start a second local console server
And the renderer uses the main process provided local console URL.

### 场景 DS.T4.3：renderer 安全边界保持
Given the operator console renderer is loaded
When it needs to submit messages, interrupt runs, or read state
Then it uses preload-exposed APIs or loopback HTTP endpoints
And it does not enable Node integration.

### 场景 DS.T4.4：macOS 主窗口集成标题栏
Given the desktop application runs on macOS
When the main BrowserWindow is created
Then it uses the hidden inset titlebar treatment with traffic-light controls positioned over the console rail
And the renderer provides a safe draggable region without covering interactive controls.

### 场景 DS.T4.5：其它平台保留原生窗口控制
Given the desktop application runs on Windows or Linux
When the main BrowserWindow is created
Then it retains usable native titlebar behavior
And project/session navigation and the bottom composer remain available.

### 场景 DS.T4.6：打开文件夹入口只返回路径
Given the desktop operator console is loaded
When the user chooses the open-project action
Then the Electron main process opens a native directory picker
And preload returns the selected folder path to the renderer
And the IPC does not write SQLite, configuration, or runner state by itself.

### 场景 DS.T4.7：renderer 仍走安全边界
Given the renderer has received a selected folder path
When it creates or updates a local project
Then it calls the loopback local console API
And it does not use Node integration or direct filesystem access.

## GitHub-mode runner child

### Requirement: Desktop GitHub-mode runner child

The desktop main process MUST start exactly one local console server for the operator console.

The desktop runner child MUST start the shared runner entrypoint in GitHub mode explicitly, rather than relying on the terminal default startup mode.

The desktop runner child MUST NOT start a duplicate local console server when the desktop main process already owns it.

The desktop runner child MUST NOT write local console SQLite session messages while running the GitHub heartbeat.

The desktop renderer MUST continue to use the main process provided local console URL.

#### Scenario: Desktop child keeps GitHub runner after terminal default flips local

- **Given** desktop main process has started its local console server
- **When** the desktop runner child starts
- **Then** it starts the runner entrypoint in GitHub mode
- **And** it does not start another local console server
- **And** it does not write local console SQLite session messages
- **And** the renderer continues to use the main process local console server URL

## Agent 团队存储

本节规则从 `console-ui` 迁入：磁盘布局、内置团队播种与结构有效性判定属于壳层数据责任，`console-ui` 只消费这里给出的状态与可用性。

### Requirement: Team storage layout and write ownership

- MUST store teams under `<dataRoot>/teams/`, where `<dataRoot>` is resolved by the existing `resolveDesktopDataRoot`.
- MUST place built-in teams under the reserved `<dataRoot>/teams/.system/` subtree and user teams as siblings directly under `<dataRoot>/teams/`.
- MUST give built-in and user teams the same on-disk shape: `team.json` plus `members/<slug>/AGENT.md`.
- MUST store only the team name, one-line description, primary agent slug, and member order in `team.json`.
- MUST NOT store member display names or member descriptions anywhere except each member's own `AGENT.md`.
- MUST reject every write request targeting a team under `.system/` at the data layer, independently of whether the UI disabled the corresponding control.
- MUST NOT convert a built-in team into a user team as a result of any external file modification.

#### Scenario: Built-in team write is rejected below the UI

- **GIVEN** a built-in team exists under `<dataRoot>/teams/.system/`
- **WHEN** a write request targeting that team or any of its members reaches the data layer without passing through the UI
- **THEN** the request is rejected with an explicit error
- **AND** no file under `.system/` is modified.

### Requirement: Agent identity metadata in frontmatter

- Team member `AGENT.md` files MUST store new display identities in leading YAML frontmatter fields `display_name` and `description`.
- `display_name` and `description` MUST be non-empty single-line strings and MUST be treated as one atomic identity pair.
- The member directory name MUST remain the only source of the stable slug; frontmatter MUST NOT duplicate a `name` or slug field.
- The team list row, member selector, current Agent heading, and mention completion MUST prefer the canonical frontmatter identity over persona headings or paragraphs, and MUST NOT cache a separate member summary that can drift from `AGENT.md`.
- When both canonical identity fields are absent, the desktop MUST preserve legacy compatibility by reading the first level-one persona heading and its first eligible paragraph.
- When only one canonical identity field exists, YAML is invalid, or either canonical value is invalid, the desktop MUST mark the team as needing repair with a visible metadata issue and MUST NOT silently combine canonical and legacy identity sources.
- New member creation MUST emit canonical snake_case identity frontmatter.
- Existing legacy user-team files MUST NOT be rewritten merely because they were read or listed.

#### Scenario: Persona heading does not replace the display name

- **GIVEN** a member `AGENT.md` declares `display_name: 开发经理` and `description: 负责技术决策、架构选型与质量保证。`
- **AND** its persona body begins with `# 角色`
- **WHEN** the built-in team and member identity render
- **THEN** the visible member name is `开发经理`
- **AND** the visible description is the frontmatter description
- **AND** `角色` remains persona content only.

#### Scenario: Legacy identity remains readable

- **GIVEN** an existing user-team member has no `display_name` or `description` frontmatter
- **AND** its persona body begins with `# 开发经理` followed by `默认接单并组织团队推进`
- **WHEN** the team is loaded after the upgrade
- **THEN** the member remains usable with that legacy display name and description
- **AND** the file is not rewritten automatically.

#### Scenario: Partial canonical identity is repairable, not silently mixed

- **GIVEN** a member frontmatter contains `display_name` but omits `description`
- **AND** the persona body contains a legacy description paragraph
- **WHEN** the team is loaded
- **THEN** the team is marked as needing repair for invalid Agent metadata
- **AND** the desktop does not combine the frontmatter name with the legacy paragraph.

### Requirement: Built-in team seeding by content fingerprint

- MUST package the repository's `seeds/teams/` directory into the installer as `seed/teams`.
- MUST compare the content fingerprint of `seed/teams` against `<dataRoot>/teams/.system/.teams-seed.marker` on startup.
- MUST replace the entire `.system/` subtree when the fingerprint does not match, and MUST skip seeding entirely when it matches.
- MUST perform the replacement by unpacking to a temporary location and then swapping atomically, and MUST write the marker file only after the swap succeeds.
- MUST NOT read, write, move, or delete anything outside `.system/` during seeding.
- MUST NOT apply the existing `buildSeedCopyPlan` skip-if-destination-exists rule to built-in teams; that rule MUST remain unchanged for `agents/` and `config.toml`.
- MUST keep the previously seeded `.system/` subtree usable when seeding fails, rather than leaving it emptied.

#### Scenario: Upgrade delivers improved built-in teams

- **GIVEN** a user installed an earlier version and its built-in teams were seeded
- **WHEN** the user upgrades to a version whose `seed/teams` content differs
- **THEN** `.system/` is replaced with the new content
- **AND** every user team directory is byte-identical to before the upgrade.

#### Scenario: Interrupted seeding does not leave a partial built-in area

- **GIVEN** seeding is in progress
- **WHEN** the process is killed before the marker file is written
- **THEN** the next startup finds a mismatched fingerprint and runs the full seeding flow again.

#### Scenario: Removed built-in team falls back rather than dangling

- **GIVEN** a built-in team existed in the previous version and is absent from the new `seed/teams`
- **WHEN** seeding replaces `.system/` and that team was recorded as the last used team
- **THEN** the last-used record falls back to the first built-in team
- **AND** existing sessions keep their history and the team version loaded at creation time.

### Requirement: Team structural readiness

- MUST treat a team as usable for creating a new conversation only when it has exactly one primary agent, that primary agent is a current member, every member has a team-unique slug, and every member's `AGENT.md` is readable with a valid canonical or legacy identity.
- MUST treat a team with no primary agent as an unfinished draft, retained on the team list and marked as such.
- MUST treat a team as needing repair when its directory is missing or unreadable, when any member's `AGENT.md` is missing, unreadable, or has invalid identity metadata, when any member lacks a slug, or when two members share a slug.
- MUST allow a single-member team to be usable when it otherwise satisfies the readiness conditions.
- MUST NOT analyze persona semantics beyond the bounded legacy identity fallback when deciding readiness.
- MUST NOT check whether files referenced by `AGENT.md` exist when deciding readiness.
- MUST re-evaluate readiness after files are restored and clear the needs-repair state once all members are valid again.

#### Scenario: Duplicate slug blocks team usage

- **GIVEN** a user team whose two members carry the same slug
- **WHEN** the team list and the new-conversation team selector render
- **THEN** the team is marked as needing repair
- **AND** it cannot be selected for a new conversation.

#### Scenario: Unfinished draft does not count as broken

- **GIVEN** a team draft with no members yet
- **WHEN** the team list renders and the sidebar entry evaluates its indicator
- **THEN** the team is marked unfinished and cannot be used for a new conversation
- **AND** the sidebar entry shows no repair indicator.

## Requirement: #14 桌面运行名单只来自会话团队
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 从会话绑定团队的内容快照解析名单并把主 Agent 排在首位；没有团队绑定的存量会话 MUST 按已登记兼容契约回退共享 agents 目录。系统 MUST NOT 在已绑定团队删除或需要修复时使用共享 agents 顶替，也 MUST NOT 把未绑定存量会话误判为团队已删除。

### Scenario: 绑定团队不可解析
- GIVEN 会话所绑团队已删除或需要修复且共享 agents 目录仍有文件
- WHEN 桌面壳为该会话解析运行名单
- THEN 返回可区分的团队错误且没有使用共享目录中的 Agent

### Scenario: 未绑定存量会话
- GIVEN 存量会话没有团队绑定且共享 agents 目录存在可用 Agent
- WHEN 桌面壳解析名单与团队健康
- THEN 使用共享目录名单并返回可继续状态

## Requirement: #17 桌面团队健康接通恢复入口
Source: docs/product/pages/main-conversation.md#三种不可继续状态的共同规则

系统 MUST 将团队已删除与团队需要修复作为不同健康状态交给本地控制台，并让改选可用团队或团队修复在真实 IPC/HTTP 装配中恢复推进。系统 MUST NOT 把缺失团队引导到不可执行的修复动作。

### Scenario: 桌面窗口改选已删除团队
- GIVEN 桌面窗口中的当前会话绑定团队已被删除并处于只读态
- WHEN 用户从团队上下文菜单改选内置可用团队
- THEN 真实会话绑定更新、输入恢复且原时间线仍可见

## Requirement: Markdown 外链通过窄 IPC 交给系统浏览器
Source: docs/product/pages/main-conversation.md#时间线

桌面壳 MUST 为已确认的 Markdown 外链提供单用途 preload IPC。主进程 MUST 使用 URL parser 再次验证绝对 URL，只允许 `http:`、`https:`、`mailto:` 后调用 `shell.openExternal`；malformed、relative、`file:`、`data:`、`javascript:` 与自定义协议 MUST 被拒绝。renderer MUST NOT 获得任意 shell、文件打开或窗口创建能力。

### Scenario: 合法与非法链接在主进程分流
- GIVEN renderer 依次提交 HTTPS URL、mailto URL、file URL 与 malformed text
- WHEN preload 调用外链 IPC
- THEN 主进程只为前两项调用 `shell.openExternal`
- AND 后两项不触发 shell、文件系统或窗口副作用

## Requirement: 主窗口拒绝 Markdown 直接导航
Source: docs/product/pages/main-conversation.md#时间线

主 BrowserWindow MUST 拒绝 renderer 内容创建新窗口，并 MUST 阻止离开应用自身页面的 top-level navigation。链接确认与系统浏览器 IPC MUST 是 Markdown 外链的唯一打开路径；context isolation 与 node integration 禁用边界 MUST 保持不变。

### Scenario: Markdown 尝试绕过外链 IPC
- GIVEN Markdown link 或 raw HTML 尝试使用 target、window.open 或 top-level navigation
- WHEN 用户激活该内容
- THEN 主窗口不新建窗口且不离开操作台页面
- AND renderer 仍不能访问 Electron、Node 或本地文件 API
