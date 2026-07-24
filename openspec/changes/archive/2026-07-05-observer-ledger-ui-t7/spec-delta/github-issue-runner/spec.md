# github-issue-runner spec delta：observer-ledger-ui-t7

## 新增行为规则
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
- MUST detect T6 roundtable child references from bounded child ref notes only when the note contains an exact `moebius-roundtable-key:[a-f0-9]{32}` key shape, show a `roundtable child` badge, and MUST NOT reveal the hidden roundtable key.
- MUST NOT show a roundtable badge for ordinary provenance text or near-miss text that resembles but does not match the exact roundtable key shape.
- MUST NOT treat roundtable completion as child acceptance pass or integration acceptance pass.
- MUST keep the existing observer diagnostics for config, intake state, role threads, agent contexts, run manifests, artifact publish links, unpublished artifact paths, missing files, malformed JSON, malformed JSONL lines, and fake `gh` / `codex` zero invocation.

## 新增场景
### 场景 T7.1：目标树展示 watched goal
Given `.state/goal-ledger.json` contains a goal whose task child issue reference points to `tranfu-labs/moebius`
And `config.local.toml` watches `tranfu-labs/moebius`
When the observer page renders
Then the primary view shows that goal as a goal -> milestone -> task tree
And diagnostics do not classify that goal as filtered out

### 场景 T7.2：完全无白名单关联 goal 不进主树
Given `.state/goal-ledger.json` contains one goal with no provenance or issue reference in a watched repository
When the observer page renders
Then that goal is not shown in the primary tree
And diagnostics count it as not watched

### 场景 T7.3：非白名单 ref 在 included goal 内置灰
Given a watched goal contains a child issue ref to `other/repo issue 9`
When the observer page renders the task refs
Then `other/repo issue 9` is visible
And it is labeled `not watched / no live poll status`

### 场景 T7.4：未归属任务固定分组
Given a task has `goalId` but no `milestoneId`
When the observer page renders its goal
Then the task appears under `未归属里程碑任务`
And it is not attached to the first milestone

### 场景 T7.5：phase owner 映射可信
Given a goal, milestone, and task each have phases
When the observer page renders the tree
Then each phase summary appears under its owner node
And active phases are highlighted
And pending/completed phases are secondary or collapsed

### 场景 T7.6：无 active 与多个 active 不推断
Given an otherwise valid ledger has owner A with no active phase
And owner B with multiple active phases
When the observer page renders
Then the primary tree still renders
And owner A shows `no active phase`
And owner B shows an owner-level ledger error
And observer does not infer a replacement active phase
And the page does not switch to a global ledger read-failure fallback

### 场景 T7.7：task detail 显示核心状态映射
Given a task has readiness, quality baseline, dependencies, scope, acceptance statements, parent issue ref, child issue refs, acceptance facts, integration events, and runManifestRefs
When the observer page renders that task
Then those fields are visible as summarized task detail
And full issue/comment bodies, raw hidden keys, and full run manifest JSON are not visible

### 场景 T7.8：gate 可见但不可操作
Given a task child ref is missing a passed acceptance fact
When the observer page renders the task
Then it shows who is expected to act, what acceptance is waiting, the child issue ref basis, and the next GitHub issue to comment on
And the page contains no confirmation button or write action

### 场景 T7.9：闸口无法定位时清晰诊断
Given a gate condition exists but the ledger lacks a required parent or child issue reference
When the observer page renders
Then it shows `闸口不可定位：ledger 缺 parent/child issue reference`

### 场景 T7.10：roundtable child badge 不计入验收
Given one task child ref bounded note contains an exact roundtable hidden key
And another child ref bounded note contains ordinary provenance text
And another child ref bounded note contains near-miss text that is not an exact roundtable key
When the observer page renders the child ref
Then only the exact roundtable child shows a `roundtable child` badge
And the raw hidden key text is not rendered
And ordinary or near-miss notes are not mislabeled as roundtable
And roundtable children are not counted as child acceptance pass or integration acceptance pass

### 场景 T7.11：explicit runManifestRefs 才是 task evidence
Given a task has one explicit runManifestRef to `.state/run-manifests.jsonl` line 12
And another run manifest record exists for the same child issue but is not explicitly referenced by the task
When the observer page renders
Then line 12 appears as task evidence
And the unreferenced run appears only under `Unlinked local runs`

### 场景 T7.12：坏 ledger fallback 保留 legacy observer
Given `.state/goal-ledger.json` contains malformed JSON
And existing intake/run manifest state is valid
When the observer page renders
Then the ledger tree shows a read-failure empty state
And the existing issue/run observer section still shows valid records

### 场景 T7.13：ledger read timeout 保留 legacy observer
Given `.state/goal-ledger.json` readFile never settles through an injected reader or fake file system
And existing intake/run manifest state is valid
When the observer page is requested
Then the HTTP response returns within the configured timeout
And the page shows a ledger timeout diagnostic
And the existing issue/run observer section still shows valid records
And fake `gh` and fake `codex` invocation logs are empty

### 场景 T7.14：observer 零写入零外部命令
Given fixture files are hashed before observer requests
And fake `gh` and fake `codex` commands record invocations
When the observer page renders and local details are expanded
Then watched config files, `.state/*.json`, `.state/run-manifests.jsonl`, artifact directories, and release directories are unchanged
And fake invocation logs are empty
