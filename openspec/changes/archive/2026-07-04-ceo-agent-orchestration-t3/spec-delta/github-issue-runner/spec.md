# github-issue-runner spec delta：ceo-agent-orchestration-t3

## 业务规则变更
- MUST treat `ceo` as both the existing stateless guardrail identity and a normal mention-triggerable Codex agent identity; the two invocation paths MUST keep distinct failure semantics.
- MUST let manual `@ceo` in the latest non-code message trigger the CEO agent through the normal mention trigger.
- MUST preserve CEO guardrail as stateless and fail-open: guardrail failures MUST NOT block the original agent comment.
- MUST give CEO agent runs an independent issue + role thread using the existing role-thread state store.
- MUST let `agents/ceo.md` use frontmatter `preScript: src/agent-prescripts/ceo-ledger-context.ts` for the normal agent path only; guardrail calls MUST parse and use the persona body without executing that preScript.
- MUST keep CEO agent visible responses at `in-progress`; CEO agent MUST NOT use `plan-written` or `code-verified`.
- MUST store CEO scripts as independent data files outside top-level `agents/*.md`; the first script set MUST include `plan-review`, `post-implementation-retro`, and `milestone-spawn-child-issues`.
- MUST validate CEO workflow id and template existence at runtime before performing orchestration side effects.
- MUST fail closed, with a visible `<ceo>:` `in-progress` failure comment, when CEO agent ledger context loading fails, the ledger file is missing, ledger schema is invalid, no unique current projection can be derived, a required script is missing, orchestration JSON is invalid, issue creation fails, or ledger child-ref writing fails.
- MUST NOT update the CEO role thread after a fail-closed CEO orchestration failure.
- MUST update the CEO role thread only after all required orchestration side effects have completed and the final CEO comment has been posted successfully.
- MUST support agent preScripts returning deterministic prompt context; runner MUST append that context to the selected agent prompt before Codex execution.
- MUST let the CEO ledger preScript inject only the current active phase projection and bounded ledger summary relevant to the current issue; it MUST NOT inject previous phase artifact bodies or the entire ledger as free context.
- MUST keep CEO orchestration side effects inside runner / TypeScript adapters; CEO agent Codex output MUST NOT directly execute `gh issue create` or arbitrary shell commands.
- MUST provide a GitHub adapter for creating an issue in the same repository as the parent issue, using controlled argv and stdin, with no automatic retry for the visible write.
- MUST bound CEO orchestration `createIssue` calls with both the GitHub adapter timeout/AbortSignal behavior and a runner-level action timeout so fake or faulty adapters cannot leave an issue job permanently unsettled.
- MUST render child issue body from validated orchestration fields and script template data, not from an arbitrary shell command.
- MUST require each spawned child issue body to include parent reference, ledger id or task id, quality baseline, acceptance statements, dependencies, initial handoff role, provenance, conflict-group reason, and a stable hidden orchestration key.
- MUST derive the stable orchestration key from parent issue source, workflow id, and ledger task id; the key MUST NOT include title, description, or other CEO free text.
- MUST reject a CEO orchestration output that contains more than one child descriptor for the same ledger task id in T3.
- MUST require each spawned child issue to contain at most one legal non-code agent mention; the initial handoff role MUST be a real triggerable agent.
- MUST create T3 child issues only in the parent issue repository; cross-repository orchestration is out of scope.
- MUST use text-level conflict grouping based on ledger scope, milestone/task wording, module/file/acceptance surfaces, dependencies, `milestone-standards.md`, and module-map boundaries; unknown or overlapping work MUST be marked serial.
- MUST write created child issue references back to the corresponding ledger task entry with local child issue reference, intent/status, and provenance; it MUST NOT implement a GitHub issue state synchronizer.
- MUST include the stable orchestration key in the ledger child reference metadata or bounded note.
- MUST skip issue creation for a child descriptor when the latest ledger task entry already contains a child reference with the same orchestration key.
- MUST search the parent repository for an existing child issue with the same hidden orchestration key before creating a new issue when the ledger has no matching child reference.
- MUST treat a unique GitHub issue found by orchestration key as an existing child issue and attempt to write its ledger child reference before considering the descriptor complete.
- MUST fail closed without creating a new issue when orchestration-key lookup fails or returns multiple matches.
- MUST NOT delete already-created child issues as compensation after a later child creation or ledger update failure; the visible failure comment MUST list created and not-created items.
- MUST use bounded timeout / AbortSignal behavior when saving ledger child references from CEO orchestration.
- MUST treat fail-closed explanation comment publishing as the visibility boundary: if the failure comment posts successfully, the issue records a visible failure and the CEO role thread remains unchanged; if the failure comment cannot be posted, the processing result MUST remain failed and enter existing intake retry / dead-letter behavior. Failure reasons for already-created or recovered child issues MUST include their issue URLs so dead-letter can preserve compensation context.
- MUST keep no-mention external fallback routing compatible with CEO: when a latest external no-mention comment has routing intent but the target is unclear or needs orchestration judgment, the route may append a single `@ceo`; when the target is clear, it may still append that target role; when there is no routing intent, it MUST return no_action.
- MUST allow external fallback route append validation to accept `@ceo` as a single valid mention once CEO is triggerable.
- MUST prevent CEO guardrail self-excitation for CEO agent comments: when `agent = ceo`, guardrail append MUST NOT use `as=ceo` and MUST NOT append a body that hands control back to `@ceo`; invalid self-loop append MUST fail open to the original CEO agent comment.
- MUST keep `role=ceo` metadata normalization as `speaker=ceo` for both guardrail and CEO agent comments.
- MUST parse CEO orchestration output after stripping a trailing valid `in-progress` stage marker; fenced JSON followed by that stage marker MUST be accepted, while invalid JSON followed by the marker MUST NOT call `createIssue`.
- MUST NOT implement T4 integration acceptance points, T5 worktree resourceization, T6 fan-out/join/roundtable topology, T7 observer UI changes, PR/push/delete actions, or cross-repository orchestration in this change.

## 场景
### 场景 T3.1：手动 @ceo 触发普通 CEO agent
Given 最新消息在非代码区域包含 `@ceo`
And `agents/ceo.md` 存在
When runner 解析 mention trigger
Then runner 选择 `ceo` agent
And 该 run 使用 issue + role = `ceo` 的独立 role thread

### 场景 T3.2：CEO agent 账本 prescript 成功注入当前阶段 projection
Given `.state/goal-ledger.json` 存在且 schema 合法
And 当前 issue 能唯一关联到一个有 active phase 的 ledger owner
When `@ceo` 触发 CEO agent
Then runner 执行 `ceo-ledger-context` prescript
And Codex prompt 包含当前 phase objective、quality baseline、acceptance statements、dependencies、owner/task identity 和可用 workflow id
And prompt 不包含已归档阶段 artifact body

### 场景 T3.3：账本缺失时 CEO 编排 fail closed
Given 最新消息包含 `@ceo`
And `.state/goal-ledger.json` 不存在
When runner 准备 CEO agent
Then runner 不调用 Codex
And runner 不创建任何 issue
And runner 发布一条 `<ceo>:` 可见失败评论，末尾为 `<!-- moebius:stage=in-progress -->`
And runner 不更新 ceo role thread

### 场景 T3.4：剧本缺失时不创建 issue
Given CEO agent 输出 `workflowId = "milestone-spawn-child-issues"`
And runtime 未加载到该 workflow 的剧本模板
When runner 校验 orchestration 输出
Then runner 不调用 GitHub issue create
And runner 发布 fail-closed 失败评论
And runner 不更新 ceo role thread

### 场景 T3.5：真实 spawn 子 issue 并注入质量基准与验收语句
Given CEO agent 输出合法 `spawn_child_issues`
And workflow id、ledger task id、initial role、quality baseline、acceptance statements、dependencies 和 provenance 均合法
When runner 执行 orchestration
Then runner 通过 GitHub adapter 在父 issue 同仓库创建子 issue
And 子 issue body 包含 parent reference、ledger task id、quality baseline、acceptance statements、dependencies、initial handoff role、provenance 和 conflict-group reason
And 子 issue body 只有一个合法 agent mention

### 场景 T3.6：创建成功后账本有 child ref
Given runner 成功创建子 issue
When runner 写回 ledger
Then 对应 `TaskRecord.childIssueRefs` 包含该 child issue reference
And reference status 为 `open`
And provenance 指向父 issue 与本次 CEO orchestration

### 场景 T3.7：部分成功不删除补偿但必须留痕
Given CEO orchestration 需要创建两个子 issue
And 第一个子 issue 已创建成功
And 第二个子 issue 创建失败
When runner 处理失败
Then runner 不删除第一个子 issue
And runner 发布 fail-closed 评论列出已创建和未创建项
And runner 不更新 ceo role thread

### 场景 T3.7a：部分成功后失败评论发布失败，下一轮不重复创建已有 child
Given CEO orchestration 需要创建两个子 issue
And 第一个子 issue 已创建成功
And 第一个子 issue 的 child ref 已写入 ledger，且带 orchestration key
And 第二个子 issue 创建失败
And fail-closed 评论发布失败
When 下一轮 runner 重试同一 CEO orchestration
Then runner 读取 ledger 后识别第一个 child descriptor 已有同 key child ref
And runner 不再次调用 GitHub create issue 创建第一个 child
And runner 继续处理未创建的 child descriptor

### 场景 T3.7aa：重跑时 title 变化不改变 orchestration key
Given CEO orchestration 第一次为 parent issue、workflow id、ledger task id `task-1` 输出 title `A`
And runner 已创建该 child issue 并记录 orchestration key
When 下一轮 CEO orchestration 为同一 parent issue、workflow id、ledger task id `task-1` 输出 title `A revised`
Then runner 计算出的 orchestration key 与第一次相同
And runner 不再次调用 GitHub create issue 创建该 child

### 场景 T3.7ab：child 已创建但 ledger ref 未写入时按 GitHub key 找回
Given runner 已创建 child issue
And child issue body 含稳定 hidden orchestration key
And ledger child ref 保存 timeout
And fail-closed 评论发布失败
When 下一轮 runner 重试同一 descriptor
Then runner 在创建前按 orchestration key 查询父 issue 同仓库
And runner 找到唯一 child issue 后不再次创建
And runner 尝试把该 child issue 写回 ledger
And 后续失败说明或 dead-letter reason 包含该 child issue URL

### 场景 T3.7b：createIssue 永久挂起时有界失败
Given CEO orchestration 需要创建 child issue
And injected `createIssue` promise 永久不 settle
When runner 执行 orchestration
Then issue job 在配置的 orchestration action timeout 内 settle
And runner 不保存 ceo role thread
And runner 不创建后续 child issue
And runner 发布可见 fail-closed 评论或进入既有 failed / dead-letter 路径

### 场景 T3.7c：ledger child ref 保存 timeout 时有界失败
Given runner 已成功创建 child issue
And child ref 保存操作 timeout
When runner 处理该 timeout
Then runner 不保存 ceo role thread
And runner 发布可见 fail-closed 评论，包含已创建 issue URL 与 ledger 写入失败原因

### 场景 T3.7d：CEO JSON 与 stage marker 共存
Given CEO Codex 输出 fenced JSON
And fenced JSON 后接合法 `<!-- moebius:stage=in-progress -->`
When runner 解析 CEO orchestration output
Then parser 接受该输出
When CEO Codex 输出非法 JSON 后接合法 stage marker
Then parser 拒绝该输出
And runner 不调用 GitHub create issue

### 场景 T3.8：guardrail 仍 fail-open
Given 任一 agent 评论进入 CEO guardrail
And CEO guardrail Codex 超时、失败或返回非法 JSON
When runner 发布评论
Then runner 发布原 agent 响应
And 评论带 `ceo-reviewed action=fail_open` 审计 metadata

### 场景 T3.9：CEO agent guardrail 防自激
Given `agent = ceo`
And CEO guardrail 返回 `append as=ceo`
When `formatCeoComment` 后置校验结果
Then guardrail 结果 fail-open 为原 CEO agent 响应
And runner 不发布额外 `as=ceo` 的自我续写评论

### 场景 T3.10：外部无 mention 路由可移交 CEO
Given active issue 最新外部 comment 没有合法 mention
And 该 comment 有路由意图但目标不清或需要编排裁决
When external comment fallback route 判定
Then 判定可返回 append body `@ceo ...`
And TypeScript 校验接受单个 `@ceo`
And 本轮只发布 `<ceo>:` route append，不直接运行 CEO
And 下一轮 active poll 由普通 mention trigger 选择 CEO agent

### 场景 T3.11：非目标不越界
Given T3 实现完成
When 检查改动范围
Then 不存在 T4 集成验收 join 语义
And 不存在 T5 issue 级 worktree resourceization
And 不存在 T6 fan-out / join / roundtable 拓扑
And 不存在 T7 observer UI 写入或展示改动
