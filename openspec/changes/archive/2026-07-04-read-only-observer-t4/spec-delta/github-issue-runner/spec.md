# github-issue-runner spec delta：read-only-observer-t4

## 新增行为规则
- MUST provide a local read-only observer entrypoint runnable as `pnpm observer`.
- MUST keep the observer process independent from the runner process: observer start, crash, exit, or kill MUST NOT affect runner heartbeat, issue processing, driver pool, role threads, intake state, artifact publishing, or CEO guardrail behavior.
- MUST NOT make runner import, call, or depend on observer modules.
- MUST make the observer read only local files: `config.toml`, `config.local.toml`, `.state/github-response-intake.json`, `.state/role-threads.json`, `.state/agent-contexts.json`, and `.state/run-manifests.jsonl`.
- MUST NOT let observer call GitHub, Codex, release upload, artifact publisher, or any state save helper.
- MUST NOT let observer write `.state/*.json`, `.state/run-manifests.jsonl`, run manifest copies, release assets, worktree files, or runner state.
- MUST render only repositories from the local watched repository whitelist; records from non-whitelisted repositories MUST be ignored.
- MUST show a distinct empty state when a whitelisted repository has no local issue records.
- MUST show a distinct read failure diagnostic when any observer input file exists but cannot be read, parsed, or shape-validated.
- MUST keep “no local issue records” and “input read failure” visually and textually distinguishable.
- MUST aggregate issue records from GitHub response intake state, role thread state, agent context state, and run manifest records without introducing a new business state machine.
- MUST label displayed issue status by source, including intake mode / failure data, role thread `lastSeenIndex`, agent context worktree data, and latest run manifest stage when available.
- MUST parse `.state/run-manifests.jsonl` line by line and skip bad or incomplete records while preserving diagnostics for the skipped line numbers.
- MUST treat a truncated final JSONL line without a trailing newline as a bad manifest line, skip that line, and preserve earlier complete records.
- MUST diagnose missing required manifest fields such as `issue` or `artifacts` without discarding other valid manifest records.
- MUST continue rendering the observer page when `.state` files are missing, JSON state files are malformed, JSONL lines are bad, or manifest records are incomplete.
- MUST classify missing `.state` files as missing diagnostics, not read failures.
- MUST classify malformed `config.toml` or `config.local.toml` as configuration read failures, not as an empty whitelist.
- MUST display run artifacts from manifest records; when `publishedUrl` is present, display it as a link, and when it appears to be an image URL, render a preview.
- MUST display staged artifact `path` as unpublished when `publishedUrl` is `null`; observer MUST NOT fabricate a URL or publish the artifact.
- MUST provide no operation buttons or write actions in the observer UI.
- MUST reread local files on browser refresh or a new HTTP request; v0 MUST NOT require a file watcher.
- MUST leave watched config files, `.state/*.json`, `.state/run-manifests.jsonl`, artifact directories, and release directories unchanged after observer start, page refresh, artifact viewing, and observer shutdown.
- MUST still render when fake `gh` and fake `codex` commands are placed earlier on `PATH`, and those fake commands MUST record no invocations during observer requests.

## 新增场景
### 场景 T4.1：白名单 issue 与阶段状态可见
Given `config.local.toml` contains `tranfu-labs/moebius`
And local state contains records for `tranfu-labs/moebius#50`
When the user runs `pnpm observer` and opens the local page
Then the page shows issue `50`
And the page shows source-labeled stage/status data from intake, role threads, agent contexts, and run manifest records where available

### 场景 T4.2：有发布截图的 issue 显示预览或链接
Given `.state/run-manifests.jsonl` contains a record for `tranfu-labs/moebius#50`
And the record contains an artifact with a non-null image-like `publishedUrl`
When the observer page renders that issue
Then the page shows the published URL
And the page renders an image preview for that artifact

### 场景 T4.3：未发布 artifact 显示只读路径
Given `.state/run-manifests.jsonl` contains an artifact with `path = "output-artifacts/t4.png"`
And `publishedUrl = null`
When the observer page renders that run
Then the page labels the artifact as unpublished
And the page shows `output-artifacts/t4.png`
And the observer does not attempt to publish or serve that local file

### 场景 T4.4：坏 JSONL 行不让页面崩溃
Given `.state/run-manifests.jsonl` contains one malformed JSON line
And later lines contain valid manifest records
When the observer page renders
Then the valid records are still shown
And diagnostics mention the skipped malformed line

### 场景 T4.5：没有记录与读取失败可区分
Given one whitelisted repository has no local issue records
And `.state/role-threads.json` exists but is malformed
When the observer page renders
Then the empty repository shows a “no issue records” state
And diagnostics separately show that `role-threads.json` failed to read or parse

### 场景 T4.6：观察页进程被强杀不影响 runner
Given the observer server is running
When the observer process is killed
And a runner heartbeat is triggered afterward
Then runner heartbeat and issue processing do not import or depend on observer modules
And runner logs contain no observer-related error

### 场景 T4.7：缺失状态文件是 missing 而不是读取失败
Given a whitelisted repository exists in local config
And `.state/github-response-intake.json`, `.state/role-threads.json`, `.state/agent-contexts.json`, and `.state/run-manifests.jsonl` are missing
When the observer page renders
Then the page returns successfully
And the repository shows a “no issue records” state
And diagnostics classify the state files as missing, not read failures

### 场景 T4.8：损坏状态与缺字段 manifest 保留合法记录
Given one state JSON file is malformed
And `.state/run-manifests.jsonl` contains one valid record, one malformed line, and one record missing `issue` or `artifacts`
When the observer page renders
Then the valid manifest record is shown
And diagnostics identify the malformed file, malformed line, and missing manifest fields

### 场景 T4.9：尾行截断不丢弃此前完整 run
Given `.state/run-manifests.jsonl` contains a complete valid run record
And the final line contains truncated JSON without a trailing newline
When the observer page renders
Then the complete run record is shown
And diagnostics identify the truncated final line as skipped

### 场景 T4.10：只读边界无文件修改
Given an observer fixture directory has recorded file list and content hashes
When the observer starts, the page is refreshed three times, artifact areas are viewed, and the observer stops
Then watched config files, `.state/*.json`, `.state/run-manifests.jsonl`, artifact directories, and release directories have no new or modified files

### 场景 T4.11：observer 不调用 gh 或 codex
Given fake `gh` and fake `codex` commands are placed earlier on `PATH`
And those fake commands record invocations and fail if called
When the observer page renders
Then the page is still usable
And fake invocation logs are empty

### 场景 T4.12：配置损坏不是空白白名单
Given `config.local.toml` exists but cannot be parsed
When the observer page renders
Then diagnostics show a configuration read failure
And the page does not report that all repositories merely have no issue records
