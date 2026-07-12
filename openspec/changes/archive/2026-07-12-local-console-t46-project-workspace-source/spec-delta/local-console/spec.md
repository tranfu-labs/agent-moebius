# local-console spec delta：local-console-t46-project-workspace-source

T4.6 将本地操作台从单一占位 project 升级为真实本地 project 层，并让 Codex cwd 由 local workspace source adapter 解析。该 delta 只规定 local console 的 project 持久化、本地 folder workspace、worktree cwd 解析和验收证据；不规定 T5 的会话树 `parent_session_id` 写入、回流/回滚全语义、CEO 本地全功能对等，也不改变 GitHub issue runner 语义。

## 新增行为规则

### Project 持久化
- MUST persist local projects in the existing `.state/local-console.sqlite` database.
- MUST associate local sessions with a persisted project id.
- MUST enforce project reference integrity for local sessions through SQLite foreign keys plus a local-session non-null constraint or an equivalent transactionally enforced strategy.
- MUST reject creating a local session for a missing project without writing a partial session or message.
- MUST migrate pre-existing local sessions into a deterministic default project without losing their messages, role handoff cursor, status, run id, run dir, or errors.
- MUST expose local project summaries with project id, real directory title, folder path, worktree mode, optional worktree unavailable reason, aggregated session counts, and child sessions.
- MUST keep `session_messages` as the durable timeline fact source; project rows only describe workspace source and grouping.
- MUST restore the same local project list after local console server or desktop shell restart when using the same SQLite database.

### Local workspace source
- MUST model local project workspace source as a folder path plus a worktree mode boolean.
- MUST resolve local Codex cwd from the session's project workspace source before every Codex run.
- MUST pass the resolved cwd explicitly to the Codex driver.
- MUST NOT continue using a single runtime-level project root as the cwd for all local sessions once a session belongs to a folder project.
- MUST keep the T2 compatibility default session and default local message endpoints working by mapping them to the default project.
- MUST NOT call `gh` as part of local project creation, workspace source resolution, or local Codex cwd selection.

### Git folder worktree mode
- MUST detect whether a local project folder is inside a git repository using bounded local `git` commands.
- MUST, when the folder is a git repository and worktree mode is enabled, create or reuse a temporary local worktree based on the repository's current `HEAD`.
- MUST run Codex in the temporary worktree when git worktree mode is enabled.
- MUST keep changes made by Codex in the temporary worktree from dirtying the original repository directory.
- MUST use bounded git operations and surface deterministic local errors when worktree preparation fails.
- MUST release the local session after a bounded git failure, timeout, or missing folder error so later local messages can be processed.
- MUST preserve the project row and existing session timeline when folder workspace resolution fails.
- MUST NOT fetch, merge, rebase, delete the original directory, or modify GitHub issue worktree state while resolving a local folder worktree.

### Direct folder mode and non-git folders
- MUST, when the folder is a git repository and worktree mode is disabled, run Codex directly in the original repository directory.
- MUST, when the folder is not a git repository, run Codex directly in the original folder.
- MUST NOT automatically run `git init` for non-git folders.
- MUST NOT reject non-git folders merely because worktree mode is enabled.
- MUST, when worktree mode is enabled for a non-git folder, record a visible deterministic workspace status reason `not-git-repository`.

### API and state
- MUST expose project create/list/update capabilities through the local console API.
- MUST allow creating a local session under a selected project.
- MUST return selected project and selected session state without requiring clients to infer project grouping from session ids.
- MUST keep the local console API loopback-only by default.

### GitHub zero drift
- MUST NOT modify GitHub issue timeline normalization, mention trigger rules, CEO guardrail, issue intake scheduling, GitHub comment publication, reaction targets, artifact publication, issue media handling, issue worktree behavior, or GitHub driver pool semantics for this change.
- MUST keep existing GitHub runner tests passing.

## 新增场景

### 场景 LC.T4.13：git project 开启 worktree 后不污染原目录
Given a local project points at a git repository folder
And worktree mode is enabled
When the user sends a local message that makes `dev` write a file
Then Codex runs with cwd inside the temporary local worktree
And the temporary worktree contains the file written by `dev`
And `git status --short` in the original repository folder is empty.

### 场景 LC.T4.14：git project 关闭 worktree 后原地运行
Given a local project points at a git repository folder
And worktree mode is disabled
When the user sends a local message that makes `dev` write a file
Then Codex runs with cwd equal to the original repository folder
And `git status --short` in the original repository folder shows the file written by `dev`.

### 场景 LC.T4.15：非 git project 开启 worktree 时降级原地跑
Given a local project points at a folder that is not a git repository
And worktree mode is enabled
When the user sends a local message that makes `dev` write a file
Then Codex runs with cwd equal to the original folder
And the system does not create a `.git` directory
And the project state exposes `worktreeUnavailableReason=not-git-repository`
And no `gh` command is called.

### 场景 LC.T4.16：project 列表重启后一致
Given the user has opened multiple local folders as projects
When the local console server or desktop shell restarts with the same SQLite database
Then the project list is restored
And each project title reflects the real folder basename
And each project's worktree mode is restored.

### 场景 LC.T4.17：local session project 引用完整
Given an old local console SQLite database contains local sessions and messages but no projects table
When the local console schema migration completes
Then every local session references an existing default project
And existing messages, cursor progress, status, runDir, and error fields are preserved.

Given a client tries to create a local session for a missing project id
When the request is handled
Then it fails without inserting a partial session or message.

### 场景 LC.T4.18：workspace resolve failure releases the session
Given a local project folder has been deleted
Or a bounded local git command times out while resolving a worktree
When the user sends a local message for that project
Then the timeline records a visible local failure or stuck record
And the active run is cleared
And a later local message in the same session can be processed.

## 验收约束

- MUST provide `code-verified` evidence showing git worktree mode writes into a temporary worktree and leaves the original repository clean.
- MUST provide `code-verified` evidence showing direct mode writes into the original git repository folder.
- MUST provide `code-verified` evidence showing non-git worktree mode runs in the original folder, does not initialize git, and reports `not-git-repository`.
- MUST provide `code-verified` evidence showing project list and real directory titles survive restart.
- MUST provide `code-verified` evidence showing fake `gh` call count is zero for the T4.6 acceptance script.
- MUST provide `code-verified` evidence showing project reference integrity is enforced and old local sessions migrate without losing timeline or cursor facts.
- MUST provide `code-verified` evidence showing bounded git or missing folder failures release the session and preserve existing project/session facts.
- MUST provide `code-verified` evidence that `pnpm test` and `pnpm typecheck` passed.
- MUST update `docs/roadmap/milestone-4-local-console.md` under T4.6 with acceptance evidence and mark T4.6 complete.
