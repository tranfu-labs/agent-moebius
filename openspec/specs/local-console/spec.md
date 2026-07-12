# local-console 规格

## 域定位

`local-console` 是默认本地对话操作台的数据通道。它复用 GitHub issue runner 已有的 conversation、mention trigger、agent persona 与 Codex driver 能力，但输入输出落在本机 HTTP API 与 `.state/local-console.sqlite`，供 Electron 操作台或本地浏览器客户端使用。本域同时承载辅助只读 observer 的诊断与呈现事实；observer 运行时仍是独立旁路，不并入本地会话状态机。

本域规定持久化本地项目及其多会话、运行直播、中断、卡住状态、本地错误记录、agent 接力位点、本地 no-mention 交棒总线、workspace diff 事实、T5 child session orchestration 的本地子会话等价能力、T5 本地验收走查/验收回流切片，以及 dead-letter / recovery 可见收敛；不承载 T5 的完整 CEO 兜底、完整 GitHub child issue 编排、artifact publishing parity，也不承载 T6 的 GitHub/local 互斥启动 flag。

## 业务规则

### 持久化与兼容入口
- MUST keep local console state in the existing `.state/local-console.sqlite`; it must not create a second persistence file disconnected from the T2/T3 local channel.
- MUST preserve the default local session and the T2 compatibility message endpoint, mapping it to the default local session.
- MUST render local session timelines from `session_messages` without inventing GitHub issue concepts.
- MUST keep local session execution serial per session; a running session must not start a second concurrent Codex run.
- MUST release the session after Codex success, failure, timeout, or user interruption so later local messages can be processed.

### 桌面操作台数据通道
- MUST expose a local console state API that returns the persisted local project list, the selected project, its sessions, the selected session timeline, global running/waiting/stuck/error counts, active run snapshot, and visible local errors.
- MUST support creating and selecting multiple local sessions under any persisted local project; session ids for new local sessions must be stable and persisted in SQLite.
- MUST preserve the project-to-session hierarchy while keeping every session row visually flat within its owning project.
- MUST expose session-scoped message submission and interrupt operations.
- MUST keep the local console API loopback-only by default.

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
- MUST resolve local Codex cwd from the session's project workspace source before every Codex run and pass it explicitly to the Codex driver.
- MUST NOT continue using a single runtime-level project root as the cwd for all local sessions once a session belongs to a folder project.
- MUST keep the T2 compatibility default session and default local message endpoints working by mapping them to the default project.
- MUST expose project create/list/update capabilities through the loopback local console API and allow creating a local session under a selected project.
- MUST NOT call `gh` as part of local project creation, workspace source resolution, or local Codex cwd selection.

### Git folder worktree mode
- MUST detect whether a local project folder is inside a git repository using bounded local `git` commands.
- MUST, when the folder is a git repository and worktree mode is enabled, create or reuse a temporary local worktree based on the repository's current `HEAD` and run Codex there.
- MUST keep changes made by Codex in the temporary worktree from dirtying the original repository directory.
- MUST use bounded git operations and surface deterministic local errors when worktree preparation fails.
- MUST release the local session after a bounded git failure, timeout, or missing folder error so later local messages can be processed.
- MUST preserve the project row and existing session timeline when folder workspace resolution fails.
- MUST NOT fetch, merge, rebase, delete the original directory, or modify GitHub issue worktree state while resolving a local folder worktree.

### Direct folder mode and non-git folders
- MUST, when the folder is a git repository and worktree mode is disabled, run Codex directly in the original repository directory.
- MUST, when the folder is not a git repository, run Codex directly in the original folder.
- MUST NOT automatically run `git init` for non-git folders or reject them merely because worktree mode is enabled.
- MUST, when worktree mode is enabled for a non-git folder, record a visible deterministic workspace status reason `not-git-repository`.

### 空白 session 项目重绑
- MUST allow a local session to change its project only while it has no session messages, no `sessions.parent_session_id` relationship in either direction, and no `session_edges` relationship in either direction.
- MUST require the target project to exist.
- MUST reject project rebinding for GitHub sessions, sessions with any message history, or sessions participating in parent/child orchestration according to either persisted relationship source.
- MUST update session project id and timestamp in one SQLite transaction.
- MUST leave the original project id, messages, cursor, session edges, and project rows unchanged when validation or update fails.
- MUST preserve the session id across a successful rebind.
- MUST keep workspace direct/worktree semantics derived from the newly bound project for the first later run.

### 空白 session 项目重绑 API
- MUST expose a loopback local-console endpoint that accepts a session id and target project id for the bounded empty-session rebind.
- MUST reject malformed input without mutation.
- MUST return HTTP 400 with a stable error code for invalid JSON or malformed rebind fields, HTTP 404 for a missing local session or target project, and HTTP 409 for a session locked by history or relationships.
- MUST NOT classify expected empty-session rebind rejection as an internal server error or map it by matching human-readable error strings.
- MUST return the updated local session summary after success.
- MUST NOT alter GitHub runner state or GitHub issue session behavior.

### 本地子会话持久化
- MUST persist parent-child session relationships in `.state/local-console.sqlite` using `sessions.parent_session_id` or an equivalent column on the existing `sessions` table.
- MUST return each session's parent session id through local session summaries and local console state APIs.
- MUST keep child sessions in the same project as their parent session.
- MUST NOT create a child session under a different project than its persisted parent session.
- MUST preserve existing root sessions with no parent reference when migrating older SQLite databases.
- MUST bound local child session creation through the existing local store timeout path so a locked database, slow worker, or hung worker cannot permanently occupy the parent session drain.

### 本地 CEO 子会话编排
- MUST map local CEO child task descriptors to local child sessions instead of GitHub child issues.
- MUST create child sessions through the existing local console SQLite store, not through GitHub APIs or a second persistence file.
- MUST derive a stable local orchestration key from parent session id, workflow id, and ledger task id before creating a child session.
- MUST recover an existing child session by hidden orchestration key before creating a new child session.
- MUST fail closed when a hidden orchestration key maps to multiple child sessions in the same parent scope.
- MUST write the child session creation and the initial child handoff message in one SQLite transaction.
- MUST write a visible parent-session progress record after child sessions are created or recovered.
- MUST NOT delete already-created child sessions as compensation after a later orchestration failure.

### 运行直播
- MUST expose active Codex run state while a local session is running: run id, role when known, runDir, elapsed time, status, a recent stdout/stderr summary, and any tail-read diagnostic.
- MUST read live output from the current runDir stdout/stderr artifacts or an equivalent Codex output stream using a bounded byte window and a bounded read timeout.
- MUST NOT let a large, missing, locked, slow, or unparseable stdout/stderr file block the state API indefinitely.
- MUST show a non-empty live summary for every running local session; when structured JSONL cannot be parsed, the UI must fall back to raw tail text or a deterministic running summary.

### 中断与失败分流
- MUST provide an interrupt operation for the current local session run.
- MUST implement interruption by aborting the active Codex run through the existing Codex driver cancellation path or an equivalent bounded termination path.
- MUST require interrupt requests to target the active run by session id and run id; a request for another session or stale run id must not abort the active run.
- MUST persist user interruption distinctly from stuck state and error failure; interrupted local messages must be distinguishable from stuck and failed local messages in SQLite, API responses, and UI.
- MUST append a visible local system record when a run is interrupted by the user.
- MUST append a visible local error record when Codex fails by non-zero exit, spawn error, or other non-timeout driver failure.
- MUST NOT classify user interruption as an error failure.
- MUST allow a local session to accept a later message after an interrupted run.

### 卡住状态
- MUST represent stuck local runs as a distinct visible state in SQLite, API responses, and UI.
- MUST classify Codex idle timeout, max-duration timeout, and stale running repair as stuck unless a more specific non-user error is available.
- MUST append a visible local system record when a run becomes stuck, including reason and runDir when available.
- MUST preserve interrupted, failed, and stuck records across renderer refresh and desktop window restart.
- MUST NOT leave a session permanently running after timeout or stale running repair.

### Dead-letter 与重启恢复
- MUST keep a failure count and last failure reason for each local source message processing failure.
- MUST count failures by source session id and source message id, not by run id.
- MUST keep a failed source message retryable until the configured local failure retry limit is exhausted.
- MUST write exactly one visible local dead-letter system record when a source message exhausts the retry budget.
- MUST persist a matching `local_dead_letters` fact for the dead-lettered source message.
- MUST complete or otherwise terminally mark the dead-lettered source message so later polling does not replay the same source message.
- MUST NOT save a successful dead-letter outcome when the visible dead-letter system record cannot be written.
- MUST NOT advance the local processing cursor when the visible dead-letter system record cannot be written.
- MUST ensure visible dead-letter system records contain no legal agent mention and do not trigger another local agent run.
- MUST allow a later local message in the same session to continue processing after an earlier message has been dead-lettered.
- MUST apply the same retry budget to `recordAgentResponse` failures that happen before the agent response is durably committed.
- MUST NOT duplicate an agent response when `recordAgentResponse` fails before commit and the source message is retried until dead-letter.
- MUST migrate old SQLite databases or missing failure metadata to default failure metadata without losing pending or running message positions.
- MUST release or recover the session cursor after stuck recording so the session is not permanently running.
- MUST NOT duplicate an agent response that was already persisted before process restart.
- MUST continue startup catch-up from the next unprocessed local trigger after restart.

### 边界
- MUST keep GitHub runner semantics untouched while allowing the local child session orchestration, local acceptance-loop, and dead-letter/recovery slices in this domain.
- MUST allow T5 child session orchestration only as local child session creation, `sessions.parent_session_id` persistence, and sidebar parent-child rendering.
- MUST allow local acceptance-role walkthrough parsing, local acceptance fact recording, parent integration progress, repair routing, and visible format diagnostics in `.state/local-console.sqlite`.
- MUST NOT modify `conversation`, `triggers`, agent mention parsing, stage parsing, CEO guardrail, goal-ledger business rules, GitHub issue timeline normalization, GitHub issue intake scheduling, GitHub comment publication, reaction targets, release artifact publication, issue media handling, issue worktree behavior, GitHub driver pool semantics, or other GitHub issue runner semantics to satisfy local-console behavior.
- MUST NOT use the local child session, acceptance-loop, or dead-letter/recovery slices to implement unrelated T5 local equivalents such as full CEO no-mention fallback, artifact publishing parity, extra worktree diff return behavior beyond the existing T5 store fact, or unconfirmed cross-mode behavior.
- MUST NOT implement T6 GitHub/local mutually exclusive startup flag or cross-mode data migration in this domain.

### 本地验收走查解析
- MUST parse acceptance-role walkthrough messages that use one line per formal acceptance statement plus one final overall conclusion line.
- MUST accept `qa`, `product-manager`, and `hermes-user` as local acceptance roles for this pre-pass.
- MUST require each walkthrough item to be numbered from 1 through the number of formal acceptance statements without gaps.
- MUST require each walkthrough item to state either pass or fail and include evidence text.
- MUST require the overall `验收结论：通过/不通过` line to match the per-statement results.
- MUST NOT infer a pass fact from a summary-only acceptance message that lacks parseable per-statement walkthrough lines.
- MUST preserve enough acceptance history to audit a failed walkthrough followed by a later passing recheck.
- MUST use the latest valid acceptance fact for routing decisions when the same acceptance role rechecks after repair.

### 本地验收 pre-pass 回流
- MUST run acceptance pre-pass before normal mention trigger handling.
- MUST write local acceptance facts before consuming any handoff mention in the same acceptance message.
- MUST create or update parent integration progress after all in-scope local child session acceptance facts pass.
- MUST route acceptance failure into a repair path instead of treating the original implementation as accepted.
- MUST keep acceptance facts, integration events, repair references, visible system messages, and cursor advancement within an atomic local SQLite boundary.
- MUST NOT advance the local processing cursor as successfully handled when visible acceptance side effects fail to write.
- MUST NOT consume a handoff mention from the same acceptance message when acceptance pre-pass fails before required visible side effects are written.
- MUST dedupe parent integration progress and repair routing by stable local keys across retries.
- MUST surface a visible blocked or error state when formal acceptance statements cannot be found for an acceptance-role message.

### 本地验收格式诊断
- MUST produce a visible format reminder or error state when an acceptance-role message clearly attempts acceptance but cannot be parsed.
- MUST NOT save a passed acceptance fact for an unparseable walkthrough.
- MUST keep the original message retryable or visibly diagnosed when format handling fails.
- MUST ensure format reminders contain no legal agent mention and do not trigger an agent run by themselves.

### 辅助只读 observer 入口
- MUST 提供本地只读观察页入口 `pnpm observer`。
- MUST 让观察页进程独立于 runner 进程：observer 启动、崩溃、退出或被强杀不得影响 runner heartbeat、issue processing、driver pool、role thread state、intake state、artifact publishing 或 CEO guardrail 行为。
- MUST NOT 让 runner import、调用或依赖 `src/observer/` 模块。
- MUST 让 observer 只读本地 `config.toml`、`config.local.toml`、`.state/goal-ledger.json`、`.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/run-manifests.jsonl`。
- MUST NOT 让 observer 调用 GitHub、Codex、release upload、artifact publisher 或任何状态 save helper。
- MUST NOT 让 observer 写 `.state/*.json`、`.state/run-manifests.jsonl`、run manifest 副本、release asset、worktree 文件或 runner state。
- MUST 让 observer 只展示本地 watched repository 白名单内的 repository；非白名单 repository 的本地记录 MUST 被忽略。
- MUST 在白名单 repository 没有本地 issue 记录时显示独立空态。
- MUST 在 observer 输入文件存在但不可读、不可解析或 shape 校验失败时显示独立读取失败诊断。
- MUST 让“没有记录”和“读取失败”在文案与视觉状态上可区分。
- MUST 从 GitHub response intake state、role thread state、agent context state 与 run manifest records 聚合 issue 记录，且 MUST NOT 新增业务状态机。
- MUST 标注每个 issue 状态来源，包括 intake mode / failure data、role thread `lastSeenIndex`、agent context worktree data，以及可用时的最新 run manifest stage。
- MUST 逐行解析 `.state/run-manifests.jsonl`，跳过坏行或不完整 record，并保留被跳过行号的诊断。
- MUST 把无换行结尾的截断 JSONL 尾行视为坏 manifest line，跳过该行并保留此前完整 records。
- MUST 诊断 manifest 缺少 `issue` 或 `artifacts` 等必填字段的 record，且不得丢弃其他有效 manifest records。
- MUST 在 `.state` 文件缺失、JSON state 文件损坏、JSONL 行损坏或 manifest record 不完整时继续渲染观察页。
- MUST 把缺失 `.state` 文件分类为 missing diagnostic，而不是读取失败。
- MUST 把损坏的 `config.toml` 或 `config.local.toml` 分类为配置读取失败，而不是空白白名单。
- MUST 从 run manifest records 展示 artifact；`publishedUrl` 存在时显示链接，且 URL 看起来是图片时渲染图片预览。
- MUST 在 `publishedUrl = null` 时把 staged artifact `path` 显示为“未发布”；observer MUST NOT 伪造 URL 或发布 artifact。
- MUST NOT 在 observer UI 提供操作按钮或写动作。
- MUST 在浏览器刷新或新 HTTP 请求时重新读取本地文件；v0 MUST NOT 要求 file watcher。
- MUST 在 observer 启动、页面刷新、artifact 区域查看与 observer 停止后，保持 watched config files、`.state/*.json`、`.state/run-manifests.jsonl`、artifact directories 与 release directories 无新增、无修改。
- MUST 在 `PATH` 前置 fake `gh` 与 fake `codex` 时仍能渲染 observer 页面，且这些 fake command 在 observer request 期间 MUST 没有调用记录。

### Ledger-first 诊断呈现
- MUST upgrade the local observer main view from issue/run-first to ledger-first when `.state/goal-ledger.json` is available and valid.
- MUST let observer read `.state/goal-ledger.json` as a local read-only input; observer MUST NOT write the ledger, call ledger save helpers, or expose a ledger write API.
- MUST bound observer's `.state/goal-ledger.json` read with an observer-local configurable timeout; if the read never settles or exceeds the timeout, observer MUST return an HTTP response with a ledger timeout diagnostic and keep the legacy issue/run section visible.
- MUST keep observer read-only: no GitHub comment writes, no runner write endpoint, no `gh` / `codex` invocation, no release upload, no file watcher, and no operation or confirmation buttons.
- MUST continue rendering the existing issue/run observer section when `.state/goal-ledger.json` is missing, malformed, or shape-invalid.
- MUST render a distinct ledger empty / read-failure state without turning the whole observer page unavailable.
- MUST display only ledger goals related to the local watched repository whitelist in the primary tree. A goal is related when any goal, milestone, task, or phase provenance or issue reference points to a watched repository.
- MUST count fully un-watched ledger goals in diagnostics rather than rendering them in the primary tree.
- MUST display non-whitelisted issue references inside an included goal as disabled or muted references labeled `not watched / no live poll status`; observer MUST NOT hide those references.
- MUST render ledger hierarchy as goal -> milestone -> task, and MUST place tasks without `milestoneId` under a fixed `未归属里程碑任务` group.
- MUST render phase summaries under their owner nodes, where owners are goals, milestones, or tasks.
- MUST highlight the active phase for each owner and keep pending / completed phases collapsed or visually secondary.
- MUST display `no active phase` when an owner has no active phase and MUST display an owner-level ledger error when an owner has multiple active phases; observer MUST NOT infer a substitute global active phase and MUST NOT turn this owner-local condition into a global ledger read-failure fallback.
- MUST display task readiness, quality baseline, dependencies, scope summary, acceptance statement count/results, parent issue ref, child issue refs, latest child acceptance fact, integration acceptance event, runManifestRefs, active phase projection, and blocked/waiting reason when present.
- MUST NOT display full issue/comment bodies, full run manifest JSON records, raw hidden orchestration keys, raw hidden integration keys, raw hidden roundtable keys, tokens, secrets, or unrelated local machine details.
- MUST render human gate visibility without operation capability: who is expected to act, what they are expected to confirm, which ledger fact / issue ref / integration event is the basis, and which GitHub issue should receive the next human comment.
- MUST render `闸口不可定位：ledger 缺 parent/child issue reference` when a gate cannot identify the next GitHub issue from ledger parent/child issue references.
- MUST use only `TaskRecord.runManifestRefs` explicit references as task evidence.
- MUST place run manifest records not explicitly referenced by a task into an `Unlinked local runs` or equivalent legacy diagnostics section; observer MUST NOT count inferred child-issue runs as task evidence.
- MUST detect T6 roundtable child references from bounded child ref notes only when the note contains an exact `agent-moebius-roundtable-key:[a-f0-9]{32}` key shape, show a `roundtable child` badge, and MUST NOT reveal the hidden roundtable key.
- MUST NOT show a roundtable badge for ordinary provenance text or near-miss text that resembles but does not match the exact roundtable key shape.
- MUST NOT treat roundtable completion as child acceptance pass or integration acceptance pass.
- MUST keep the existing observer diagnostics for config, intake state, role threads, agent contexts, run manifests, artifact publish links, unpublished artifact paths, missing files, malformed JSON, malformed JSONL lines, and fake `gh` / `codex` zero invocation.

## 场景

### 场景 LC.OBS.1：白名单 issue 与阶段状态可见
Given `config.local.toml` 包含 `tranfu-labs/agent-moebius`
And 本地状态包含 `tranfu-labs/agent-moebius#50` 的记录
When 用户运行 `pnpm observer` 并打开本地页面
Then 页面显示 issue `50`
And 页面按来源标注 intake、role thread、agent context 与 run manifest 中可用的阶段 / 状态数据

### 场景 LC.OBS.2：有发布截图的 issue 显示预览或链接
Given `.state/run-manifests.jsonl` 包含 `tranfu-labs/agent-moebius#50` 的 record
And 该 record 包含 `publishedUrl` 非空且看起来是图片 URL 的 artifact
When observer 页面渲染该 issue
Then 页面显示该 published URL
And 页面为该 artifact 渲染图片预览

### 场景 LC.OBS.3：未发布 artifact 显示只读路径
Given `.state/run-manifests.jsonl` 包含 `path = "output-artifacts/t4.png"` 的 artifact
And `publishedUrl = null`
When observer 页面渲染该 run
Then 页面把该 artifact 标为“未发布”
And 页面显示 `output-artifacts/t4.png`
And observer 不尝试发布或 serve 该本地文件

### 场景 LC.OBS.4：坏 JSONL 行不让页面崩溃
Given `.state/run-manifests.jsonl` 包含一行损坏 JSON
And 后续行包含有效 manifest records
When observer 页面渲染
Then 有效 records 仍被显示
And 诊断区指出被跳过的损坏行

### 场景 LC.OBS.5：没有记录与读取失败可区分
Given 一个白名单 repository 没有本地 issue 记录
And `.state/role-threads.json` 存在但内容损坏
When observer 页面渲染
Then 空 repository 显示“没有记录”状态
And 诊断区单独显示 `role-threads.json` 读取或解析失败

### 场景 LC.OBS.6：观察页进程被强杀不影响 runner
Given observer server 正在运行
When observer 进程被强杀
And 随后触发一轮 runner heartbeat
Then runner heartbeat 与 issue processing 不 import 或依赖 observer modules
And runner 日志没有 observer 相关错误

### 场景 LC.OBS.7：缺失状态文件是 missing 而不是读取失败
Given 本地配置中存在一个白名单 repository
And `.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/run-manifests.jsonl` 均缺失
When observer 页面渲染
Then 页面成功返回
And 该 repository 显示“没有记录”状态
And 诊断区把这些 state files 分类为 missing，而不是读取失败

### 场景 LC.OBS.8：损坏状态与缺字段 manifest 保留合法记录
Given 一个 state JSON 文件损坏
And `.state/run-manifests.jsonl` 包含一个有效 record、一行损坏 JSON、一个缺少 `issue` 或 `artifacts` 的 record
When observer 页面渲染
Then 有效 manifest record 被显示
And 诊断区指出损坏文件、损坏行与缺失 manifest 字段

### 场景 LC.OBS.9：尾行截断不丢弃此前完整 run
Given `.state/run-manifests.jsonl` 包含一个完整有效 run record
And 最后一行是没有结尾换行的截断 JSON
When observer 页面渲染
Then 完整 run record 被显示
And 诊断区指出截断尾行已跳过

### 场景 LC.OBS.10：只读边界无文件修改
Given observer fixture 目录已记录初始文件列表与内容哈希
When observer 启动、页面刷新三次、artifact 区域被查看且 observer 停止
Then watched config files、`.state/*.json`、`.state/run-manifests.jsonl`、artifact directories 与 release directories 没有新增或修改文件

### 场景 LC.OBS.11：不调用 gh 或 codex
Given fake `gh` 与 fake `codex` commands 被放到 `PATH` 前面
And 这些 fake commands 会记录调用并在被调用时失败
When observer 页面渲染
Then 页面仍可用
And fake invocation logs 为空

### 场景 LC.OBS.12：配置损坏不是空白白名单
Given `config.local.toml` 存在但无法解析
When observer 页面渲染
Then 诊断区显示配置读取失败
And 页面不把所有 repository 误报为“没有记录”

### 场景 LC.OBS.T7.1：目标树展示 watched goal
Given `.state/goal-ledger.json` contains a goal whose task child issue reference points to `tranfu-labs/agent-moebius`
And `config.local.toml` watches `tranfu-labs/agent-moebius`
When the observer page renders
Then the primary view shows that goal as a goal -> milestone -> task tree
And diagnostics do not classify that goal as filtered out

### 场景 LC.OBS.T7.2：完全无白名单关联 goal 不进主树
Given `.state/goal-ledger.json` contains one goal with no provenance or issue reference in a watched repository
When the observer page renders
Then that goal is not shown in the primary tree
And diagnostics count it as not watched

### 场景 LC.OBS.T7.3：非白名单 ref 在 included goal 内置灰
Given a watched goal contains a child issue ref to `other/repo issue 9`
When the observer page renders the task refs
Then `other/repo issue 9` is visible
And it is labeled `not watched / no live poll status`

### 场景 LC.OBS.T7.4：未归属任务固定分组
Given a task has `goalId` but no `milestoneId`
When the observer page renders its goal
Then the task appears under `未归属里程碑任务`
And it is not attached to the first milestone

### 场景 LC.OBS.T7.5：phase owner 映射可信
Given a goal, milestone, and task each have phases
When the observer page renders the tree
Then each phase summary appears under its owner node
And active phases are highlighted
And pending/completed phases are secondary or collapsed

### 场景 LC.OBS.T7.6：无 active 与多个 active 不推断
Given an otherwise valid ledger has owner A with no active phase
And owner B with multiple active phases
When the observer page renders
Then the primary tree still renders
And owner A shows `no active phase`
And owner B shows an owner-level ledger error
And observer does not infer a replacement active phase
And the page does not switch to a global ledger read-failure fallback

### 场景 LC.OBS.T7.7：task detail 显示核心状态映射
Given a task has readiness, quality baseline, dependencies, scope, acceptance statements, parent issue ref, child issue refs, acceptance facts, integration events, and runManifestRefs
When the observer page renders that task
Then those fields are visible as summarized task detail
And full issue/comment bodies, raw hidden keys, and full run manifest JSON are not visible

### 场景 LC.OBS.T7.8：gate 可见但不可操作
Given a task child ref is missing a passed acceptance fact
When the observer page renders the task
Then it shows who is expected to act, what acceptance is waiting, the child issue ref basis, and the next GitHub issue to comment on
And the page contains no confirmation button or write action

### 场景 LC.OBS.T7.9：闸口无法定位时清晰诊断
Given a gate condition exists but the ledger lacks a required parent or child issue reference
When the observer page renders
Then it shows `闸口不可定位：ledger 缺 parent/child issue reference`

### 场景 LC.OBS.T7.10：roundtable child badge 不计入验收
Given one task child ref bounded note contains an exact roundtable hidden key
And another child ref bounded note contains ordinary provenance text
And another child ref bounded note contains near-miss text that is not an exact roundtable key
When the observer page renders the child ref
Then only the exact roundtable child shows a `roundtable child` badge
And the raw hidden key text is not rendered
And ordinary or near-miss notes are not mislabeled as roundtable
And roundtable children are not counted as child acceptance pass or integration acceptance pass

### 场景 LC.OBS.T7.11：explicit runManifestRefs 才是 task evidence
Given a task has one explicit runManifestRef to `.state/run-manifests.jsonl` line 12
And another run manifest record exists for the same child issue but is not explicitly referenced by the task
When the observer page renders
Then line 12 appears as task evidence
And the unreferenced run appears under `Unlinked local runs`

### 场景 LC.OBS.T7.12：坏 ledger fallback 保留 legacy observer
Given `.state/goal-ledger.json` contains malformed JSON
And existing intake/run manifest state is valid
When the observer page renders
Then the ledger tree shows a read-failure empty state
And the existing issue/run observer section still shows valid records

### 场景 LC.OBS.T7.13：ledger read timeout 保留 legacy observer
Given `.state/goal-ledger.json` readFile never settles through an injected reader or fake file system
And existing intake/run manifest state is valid
When the observer page is requested
Then the HTTP response returns within the configured timeout
And the page shows a ledger timeout diagnostic
And the existing issue/run observer section still shows valid records
And fake `gh` and fake `codex` invocation logs are empty

### 场景 LC.OBS.T7.14：observer 零写入零外部命令
Given fixture files are hashed before observer requests
And fake `gh` and fake `codex` commands record invocations
When the observer page renders and local details are expanded
Then watched config files, `.state/*.json`, `.state/run-manifests.jsonl`, artifact directories, and release directories are unchanged
And fake invocation logs are empty

### 场景 LC.T4.1：桌面台发起对话后看到运行直播
Given the desktop operator console is open
And it shows the persisted local project list with each session under its owning project
When the user creates or selects a local session
And sends a message that triggers a fake slow Codex run
Then the session timeline shows the user message
And it shows an in-progress run block
And the run block includes a non-empty live summary, elapsed time, and runDir
And the UI does not show a blank running state.

### 场景 LC.T4.2：运行中断后状态如实反映
Given a local session has an active fake slow Codex run
When the user clicks interrupt
Then the Codex run is aborted through the local runtime
And the original local message is persisted as interrupted rather than failed
And a visible system record states that the run was interrupted by the user
And the session is released for a later message.

### 场景 LC.T4.3：Codex 失败形成本地错误记录
Given a local session message triggers fake Codex
And fake Codex exits non-zero or fails to spawn
When the local runtime records the result
Then the original local message is persisted as failed
And the timeline shows a visible local error record with reason and runDir when available
And the error is present after refresh rather than only in process logs.

### 场景 LC.T4.4：多会话导航不并发污染
Given the local project has session A and session B
And session A is running
When the user switches to session B
Then session B timeline remains readable
And session A still appears as running in the sidebar
And session B cannot accidentally interrupt session A unless the interrupt targets session A's active session id and run id.

### 场景 LC.T4.5：结构化输出缺失时降级显示
Given a Codex run has a runDir but stdout.jsonl has no parseable assistant or progress event yet
When the desktop console renders the active run
Then it still displays a deterministic non-empty running summary
And it includes runDir or elapsed time as supporting evidence.

### 场景 LC.T4.6：尾流读取有界
Given a Codex run has a very large stdout.jsonl
Or reading stdout/stderr is slow or fails
When the desktop console polls local state
Then the state API returns within the configured bound
And the run block displays a recent tail summary or deterministic fallback
And the session remains interruptible.

### 场景 LC.T4.7：timeout 或 stale running 显示卡住
Given a local Codex run hits idle timeout, max-duration timeout, or stale running repair
When the local runtime records the result
Then the original message is persisted as stuck
And the timeline shows a visible stuck record with reason and runDir when available
And the session is released for a later message.

### 场景 LC.T4.8：刷新后状态仍可见
Given a local session contains interrupted, failed, and stuck records
When the renderer refreshes or the desktop window restarts
Then the records are restored from SQLite/API
And their status, reason, and runDir remain distinguishable.

### 场景 LC.T5.1：子会话保存父会话引用
Given a local parent session exists
When local child session creation runs for a CEO-orchestrated task
Then a child session row is inserted or recovered
And the child session row stores the parent session id
And listing sessions returns the child with that parent session id.

### 场景 LC.T5.2：project mismatch 不创建跨 project child
Given a local parent session is persisted under project A
When local child session creation is called with project B
Then the command fails closed or uses the persisted project A
And no child session is created under project B
And the parent session project is not silently rewritten.

### 场景 LC.T5.3：child creation 挂起有界释放
Given local child session creation never returns or exceeds the local store timeout
When the runtime handles the orchestration attempt
Then the parent session run is recorded as visible failed or stuck
And orchestration success is not saved
And the parent session can accept a later local message.

### 场景 LC.T5.4：多子任务目标创建本地子会话
Given a local parent session receives a CEO orchestration result with multiple child task descriptors
When the local child session executor runs
Then one local child session is created or recovered for each descriptor
And each child session contains an initial handoff message
And the parent session receives a visible progress record referencing the child sessions.

### 场景 LC.T5.5：重试不重复创建子会话
Given a previous local child session was created with a hidden orchestration key
And the orchestration success state was not saved
When the same descriptor is retried
Then the existing child session is recovered
And no duplicate child session or duplicate initial handoff message is inserted.

### 场景 LC.T5.6：hidden key collision fail closed
Given two existing child sessions under the same parent contain the same hidden orchestration key
When local child session recovery retries that key
Then recovery fails closed with a visible error
And neither child session is selected as a successful recovery.

### 场景 LC.T5.7：本地验收角色通过走查写入事实并驱动父级回流
Given a local child session has formal acceptance statements
When `product-manager`, `hermes-user`, or `qa` writes parseable numbered walkthrough lines and `验收结论：通过`
Then the local console records a passed local acceptance fact
And the evidence records statement-level results
And the parent session receives one deduped integration progress or request event.

### 场景 LC.T5.8：本地验收角色不通过走查创建回修路径
Given a local child session has formal acceptance statements
When an acceptance role writes one or more failed walkthrough lines and `验收结论：不通过`
Then the local console records a failed local acceptance fact
And a stable repair handoff or repair child session is created or recovered
And the parent session can see the repair reference.

### 场景 LC.T5.9：先失败后复验通过使用最新事实
Given an acceptance role first writes a parseable failed walkthrough
And a repair path is created or recovered
When the same acceptance role later writes a parseable passing walkthrough for the same task
Then the latest passed fact drives parent rejoin or integration progress
And the previous failed repair remains visible as a system record, repair reference, or historical acceptance fact.

### 场景 LC.T5.10：父级可见写失败可重试且不消费同消息 handoff
Given a local child acceptance fact is ready to trigger parent integration progress
And writing the visible parent progress fails
When local acceptance pre-pass settles
Then the triggering message cursor is not advanced
And any handoff mention in the same message is not consumed
And a completed parent integration request is not recorded
And a later retry creates only one deduped parent integration progress.

### 场景 LC.T5.11：验收格式错误产生可见提醒
Given a local child session has formal acceptance statements
When an acceptance role writes `验收结论：通过` without parseable numbered walkthrough lines
Then the local console writes a visible format reminder or error state
And no passed local acceptance fact is recorded
And the missing fact remains visible in local T5 facts or session status.

### 场景 LC.T5.12：格式错误同消息 handoff 不触发普通交棒
Given a local child session has formal acceptance statements
When an acceptance role writes malformed walkthrough lines and also includes a legal handoff mention
Then the local console writes a visible format reminder or error state
And no passed local acceptance fact is recorded
And the handoff mention in that same message is not consumed by normal trigger handling.

### 场景 LC.T5.13：缺 formal acceptance statements 时阻塞验收
Given a local child session has no readable formal acceptance statements
When an acceptance role writes an acceptance walkthrough
Then the local console writes a visible blocked or error state
And no passed acceptance fact is recorded
And the local console does not invent an acceptance scope.

### 场景 LC.T5.14：验收 store timeout 释放 drain
Given a local acceptance pre-pass SQLite command never settles
When the configured local store timeout is reached
Then the session drain is released
And the triggering message remains retryable or visibly diagnosed
And no successful acceptance fact is saved for that attempt.

### 场景 LC.T5.DL1：连续失败只 dead-letter 一次
Given a local source message repeatedly fails with the same non-timeout processing error
When the failure count reaches the local retry limit
Then the local timeline contains one visible dead-letter system record for that source message
And `local_dead_letters` contains one matching fact
And later polling does not write another dead-letter for the same source message
And the session can process a later local message.

### 场景 LC.T5.DL2：agent response 提交前失败不会重复回复
Given `recordAgentResponse` fails before commit for the same local source message until the retry budget is exhausted
When local processing settles
Then the local timeline contains one visible dead-letter system record for that source message
And `local_dead_letters` contains one matching fact
And no agent response is duplicated
And the session can process a later local message.

### 场景 LC.T5.DL3：dead-letter 可见写失败保持可重试
Given a local source message has exhausted the local retry budget
And writing the visible dead-letter system record fails
When local processing settles
Then the local processing cursor is not advanced
And no successful `local_dead_letters` fact is saved
And a later retry can attempt the visible dead-letter write again.

### 场景 LC.T5.DL4：dead-letter reason 不会自触发
Given a local source message dead-letters with a reason that contains handoff-like text
When the visible dead-letter system record is written
Then the visible dead-letter system record contains no legal agent mention
And later local drain does not trigger an agent from the dead-letter system record.

### 场景 LC.T5.R1：重启 catch-up 不重复已完成 response
Given a local session already contains a persisted agent response
And the process restarts before the next local trigger is claimed
When the local console server starts and runs catch-up
Then the persisted agent response is not written a second time
And the next unprocessed trigger can still be processed.

### 场景 LC.T5.R2：stale running 重启后释放 session
Given a local source message is left running across process restart
When local startup stale repair marks the run stuck
Then the local timeline shows a visible stuck record with reason and runDir when available
And the session no longer reports a running source message
And a later local message can be accepted and processed.

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

### 场景 LC.NSPS.1：空白 session 原子重绑
Given a local session has no messages, parent column relationship, child column relationship, or session edges
And the target project exists
When the rebind command runs
Then the same session id references the target project
And no message, cursor, edge, or project row is created or deleted.

### 场景 LC.NSPS.2：已有历史拒绝重绑
Given a local session has at least one message, a parent/child relationship in `sessions.parent_session_id`, or a parent/child relationship in `session_edges`
When a client requests rebinding to another project
Then the request fails
And the session project, messages, cursor, and edges remain unchanged.

### 场景 LC.NSPS.3：双事实源失配时 fail closed
Given a local session relationship exists only in `sessions.parent_session_id`
Or the relationship exists only in `session_edges`
When a client requests rebinding either related session
Then the request fails with the stable relationship-conflict code
And neither session changes project.

### 场景 LC.NSPS.4：非法目标无部分写入
Given a local empty session exists
And the requested target project does not exist
When the rebind command runs
Then the command fails
And the session still references its original project.

### 场景 LC.NSPS.5：API 业务错误分流
Given the rebind endpoint receives malformed input, a missing local resource, or a locked session
When the request is handled
Then it returns 400, 404, or 409 respectively with a stable error code
And no expected business rejection is returned as 500.

## Terminal startup isolation

### Requirement: Local and GitHub runtime isolation

The local-console domain MUST keep GitHub runner semantics untouched while allowing local equivalents for CEO routing, child sessions, acceptance pre-pass, dead-letter recovery, local role threads, local evidence, worktree diff return, and the terminal startup selection that makes local mode the default.

The local-console domain MUST NOT modify GitHub issue timeline normalization, mention trigger rules, GitHub CEO orchestration, issue intake scheduling, GitHub comment publication, reaction targets, release artifact publication, issue media handling, issue worktree behavior, observer behavior, or GitHub driver pool semantics.

The local-console domain MUST NOT migrate local console session data into GitHub mode, mirror local session data into GitHub runner state, or share runtime writes between local mode and GitHub mode.

The GitHub-mode one-time extraction of existing GitHub runner state from a previously shared SQLite file is owned by the GitHub issue runner startup path and MUST NOT include local console session tables.

#### Scenario: Local startup selection does not change GitHub runner semantics

- **Given** terminal startup selection makes local mode the default
- **When** local-console behavior is implemented
- **Then** GitHub issue timeline normalization, mention trigger rules, issue intake scheduling, GitHub comment publication, reaction targets, release artifact publication, issue media handling, issue worktree behavior, and GitHub driver pool semantics remain governed by their existing GitHub runner specifications
- **And** observer behavior remains governed by the local-console observer specifications

### Requirement: Local default startup

The default terminal `pnpm start` command without `--github-mode` MUST start local console / local mode.

The default local mode startup path MUST use the local console SQLite data chain and MUST NOT start GitHub issue scanning.

The default local mode startup path MUST NOT read GitHub issue bodies, GitHub comments, or GitHub issue lists.

The default local mode startup path MUST NOT require GitHub authentication as a precondition for starting the local console server.

The default local mode startup path MUST start successfully in a clean environment with no configured repositories and no GitHub authentication.

Local mode runtime data MUST remain in the local console SQLite data chain and MUST NOT be mirrored into GitHub response intake, role-thread, agent-context, or goal-ledger state as part of terminal startup selection.

Local mode and GitHub mode MAY use the same data root, but they MUST NOT use the same runtime store tables or state channel for local session messages and GitHub issue runner state.

#### Scenario: Default start enters local mode

- **Given** the user runs `pnpm start` without `--github-mode`
- **When** startup mode is resolved
- **Then** the local console server starts
- **And** GitHub issue scanning does not start
- **And** GitHub issue read adapters are not called

#### Scenario: Clean environment starts local mode without GitHub authentication

- **Given** no repository is configured
- **And** GitHub authentication is unavailable
- **When** the user runs `pnpm start` without `--github-mode`
- **Then** the local console server starts without error
- **And** no GitHub heartbeat is created
- **And** no GitHub issue adapter is called

#### Scenario: Local and GitHub state remain separate

- **Given** local mode writes a representative local session message
- **And** GitHub mode writes a representative GitHub intake or role-thread state entry
- **When** the two state stores are inspected
- **Then** the local session message is visible only through the local SQLite data chain
- **And** the GitHub intake or role-thread state entry is visible only through the GitHub mode state channel
- **And** neither startup mode mirrors the representative data into the other mode

### Requirement: Operational startup documentation

The local-console domain MUST document the mutually exclusive local and GitHub startup modes.

The operational documentation MUST name the GitHub-mode flag as `--github-mode` and state its startup command as `pnpm start -- --github-mode`.

The operational documentation MUST state that bare `pnpm start` enters the default local mode, while the explicit GitHub-mode command starts the pure GitHub runner without the local console SQLite session write path.

The operational documentation MUST state that local mode uses `.state/local-console.sqlite` and GitHub mode uses `.state/github-runner.sqlite`, and that the two runtime data channels are mutually invisible, not mirrored, and not run concurrently.

The operational documentation MUST instruct operators of a persistent GitHub runner to use `pnpm start -- --github-mode` instead of bare `pnpm start`.

#### Scenario: Operator selects a runtime mode

- **Given** an operator reads the startup documentation
- **When** the operator selects a runtime mode
- **Then** `AGENTS.md` documents `--github-mode` and `pnpm start -- --github-mode`
- **And** `AGENTS.md` states that bare `pnpm start` enters local mode
- **And** `AGENTS.md` states that local mode and GitHub mode use isolated data paths
- **And** `AGENTS.md` tells persistent GitHub runner operators to use the explicit GitHub-mode command

## 可验证行为
- `pnpm vitest run tests/observer.test.ts` MUST 通过，覆盖 observer 的白名单聚合、状态来源标注、artifact 发布链接 / 图片预览、未发布 artifact 路径、缺 `.state` 文件、坏 state JSON、坏 JSONL、JSONL 尾行截断、manifest 缺字段、损坏 config 诊断、无写入边界、fake `gh` / `codex` 零调用，以及 observer 被强杀后 runner 测试不受影响。
- `pnpm test` MUST 通过，确保本域规格归位不引入 GitHub runner 核心语义回归。
