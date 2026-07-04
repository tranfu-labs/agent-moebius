# Design: external-comment-fallback-ceo-audit-t8

## Plan

### 1. Entry conditions for fallback routing

The fallback route path runs only inside `processIssueSource` after `resolveTrigger` returns `skip/no-trigger`.

The latest timeline message must satisfy all of these conditions:

- `input.issue.state` is `OPEN`;
- the issue processing job is active-context work, either from an active poll or from a changed issue whose previous intake state is already active;
- the latest message source is `comment`, not issue body;
- the corresponding GitHub comment has a stable `id`;
- the normalized latest speaker is `user`;
- the raw comment body has no runner metadata such as `agent-moebius:role=...` or `agent-moebius:dead-letter`;
- `selectMentionedAgent` finds no valid agent mention outside Markdown code areas;
- the intake state ledger has not already recorded a fallback route decision for this comment id.

The active-context distinction is required because repository idle scans can discover changed issues. If the changed issue was previously active, the fallback route may run; if it was idle, it remains an ordinary `no-trigger`.

This keeps `src/triggers/` focused on ordinary mentions. Fallback routing is an orchestration rule, not a trigger rule.

### 2. Stateless CEO-style route judgment

Add a route helper in `src/format-ceo.ts` or an adjacent guardrail module, reusing the CEO persona file and Codex adapter shape but with a separate prompt and parser.

The route output contract is intentionally smaller than normal CEO correction:

```json
{"action":"no_action","reason":"..."}
```

or:

```json
{"action":"append","body":"@dev ...","reason":"..."}
```

TypeScript validation only enforces structure:

- valid JSON object;
- action is `no_action` or `append`;
- append body is non-empty;
- append body contains exactly one valid agent mention outside Markdown code areas;
- the target role is in the ordinary Codex agent set and is not `ceo`;
- invalid JSON, unknown actions, empty body, no mention, multiple mentions, unknown role, `@ceo`, fenced-code-only mentions, or inline-code-only mentions all become `fail_open`.

The actual routing criteria live in `agents/ceo.md`: decide whether the external text has clear route intent and either return no action or produce one append comment as `ceo`.

The helper uses the same bounded execution style as CEO guardrail: timeout, cancellation, slow failure, or a route promise that never settles returns fail-open and does not block the issue job or later heartbeats indefinitely. Fail-open preserves current behavior except that the comment id is recorded as judged, which is the explicit cost-control tradeoff accepted by product-manager.

### 3. Intake fallback ledger

Extend `IntakeIssueState` with an optional field such as:

```ts
fallbackRouteDecisions?: Record<string, {
  commentId: string;
  outcome: "no_action" | "append" | "fail_open";
  judgedAt: string;
  targetRole?: string;
  reason?: string;
}>;
```

The state loader must accept old `.state/github-response-intake.json` files where this field is absent.

`github-response-intake.ts` remains pure business state:

- add helpers to check whether a comment id has already been judged;
- add pure folding helpers to record `no_action`, `append`, and `fail_open`;
- keep existing `recordIssueProcessingOutcome` semantics for issue `updatedAt`, mode, failure accounting, and active poll scheduling.

The fallback route decision is recorded once per comment id even when the route call fails or returns malformed output. This prevents repeated Codex cost and repeated visible route attempts for the same bad comment.

### 4. Publishing and CEO audit metadata

Add uniform metadata constants and helpers, for example:

```text
<!-- agent-moebius:ceo-reviewed action=no_change -->
<!-- agent-moebius:ceo-reviewed action=replace -->
<!-- agent-moebius:ceo-reviewed action=append-original -->
<!-- agent-moebius:ceo-reviewed action=append-ceo -->
<!-- agent-moebius:ceo-reviewed action=fail_open -->
<!-- agent-moebius:ceo-reviewed action=bypass reason=media-preparation-failed -->
<!-- agent-moebius:ceo-reviewed action=bypass reason=artifact-publishing-failed -->
<!-- agent-moebius:ceo-reviewed action=not_applicable reason=dead-letter -->
<!-- agent-moebius:ceo-reviewed action=not_applicable reason=fallback-route-append -->
```

The exact attribute spelling can be adjusted during implementation, but every runner-published role-envelope comment must include an auditable `ceo-reviewed` marker or an explicit bypass / not-applicable reason.

Apply the marker at the runner publishing boundary, not by changing `formatAgentComment` alone:

- ordinary agent comment when CEO returns `NO_CHANGE`: role envelope + `ceo-reviewed action=no_change`;
- CEO `REPLACE`: role envelope + `ceo-reviewed action=replace` + existing `ceo-corrected`;
- CEO `APPEND`: original role envelope + `ceo-reviewed action=append-original`, independent append role envelope + `ceo-reviewed action=append-ceo` + `ceo-corrected`;
- CEO `FAIL_OPEN`: original role envelope + `ceo-reviewed action=fail_open`;
- media preparation failure: role envelope + bypass reason;
- artifact publishing failure: role envelope + bypass reason;
- dead-letter comment: not-applicable reason because it is a system comment, not a Codex agent response;
- fallback route append as `ceo`: role envelope + not-applicable reason because it is itself the route judgment output, not a normal CEO review of another agent response.

`normalizeComment` should continue to classify comments by `agent-moebius:role=...`; the new metadata must not change speaker normalization.

### 5. Issue 41 evidence classification

Read-only evidence checked for the contradictory product-manager conclusions:

- `gh issue view 41` shows two product-manager conclusion pairs with opposite conclusions:
  - `2026-07-04T01:37:23Z` to `2026-07-04T01:37:42Z`, 19 seconds apart;
  - `2026-07-04T01:46:16Z` to `2026-07-04T01:47:00Z`, 44 seconds apart.
- The comments carry `role=product-manager` metadata.
- In this issue worktree, `.state/` is unavailable.
- Local `/tmp/agent-moebius-*` run directories do not provide usable raw runner stdout / stderr for those PM runs.
- The repository does not contain raw runner logs for those timestamps.

Classification: other. Raw runner logs are unavailable, and the currently readable issue metadata plus local run artifacts cannot prove double runner instances, forged envelope comments, or log misread. Therefore this task does not expand into T1 process-level locking or T2 protocol enforcement. The concrete repair scope remains fallback routing, CEO review audit markers, and tests that make future bypass / forgery easier to detect.

### 6. Test plan

Add focused unit tests:

- `github-response-intake.test.ts`: old state without the new field loads, fallback decision helpers record `no_action`, `append`, and `fail_open`, and duplicate comment ids are not eligible again.
- `github-intake-state.test.ts` or existing loader coverage: persisted issue state with absent fallback field remains valid.
- `runner.test.ts`: active issue latest external no-mention comment invokes route judgment once; route `append` posts a `ceo` role-envelope comment with one valid mention; route `no_action` records state and posts nothing; route `fail_open` records state and posts nothing; repeated same comment id does not invoke route again.
- `runner.test.ts`: a fake fallback route promise that never settles, or exceeds an injected test timeout budget, still lets the issue job settle, records `fail_open`, posts no append, does not block a later heartbeat, and suppresses duplicate judgment for the same comment id.
- `runner.test.ts`: changed job for an already-active issue can route; changed job for an idle issue does not route.
- `format-ceo.test.ts` or route helper tests: invalid JSON, multiple mentions, unknown role, `@ceo`, no mention, empty body, fenced-code-only mention, and inline-code-only mention all fail-open.
- `runner.test.ts`: CEO review metadata appears on agent `no_change`, `replace`, `append` original, CEO append, CEO fail-open, media failure, artifact failure, dead-letter, and fallback route append paths; `ceo-corrected` appears only on replace / append correction subclasses.
- `conversation.test.ts`: new `ceo-reviewed` metadata does not change speaker normalization.

Verification after implementation:

```sh
git diff --check
pnpm test
pnpm typecheck
```

## QA Review Response

The seven dev-manager / QA test-design additions are incorporated into this plan as quality gates. Product-manager accepted them on the issue timeline, so they are part of the implementation and final evidence checklist.

The additions are:

1. Active changed issue vs idle changed issue fallback routing.
2. `append` / `no_action` / `fail_open` intake state recording and duplicate suppression by comment id.
3. Invalid append parser cases: no mention, multiple mentions, unknown mention, `@ceo`, and code-block-only mention.
4. Full runner-visible publish-path CEO review marker matrix and `ceo-corrected` subclass check.
5. Backward compatibility for old intake state and speaker normalization with new metadata.
6. Bounded fallback route execution when the route promise never settles or exceeds an injected timeout budget.
7. Inline-code-only fallback append mention parsing as `fail_open`.

## Acceptance Statements

### Official acceptance statements

These are kept exactly as supplied by the requirement owner.

1. 构造 active issue 上无 mention 的外部评论（含明确路由意图文案）→ 跑一轮 intake → 应看到一次路由判定被执行，产出"无需行动"记录或一条带单个 `@` 的 append 评论；同一评论第二轮不再重复判定。
2. 任取一条 runner 新发布的评论 → 检查 body → 应看到 CEO 审阅标记（含未被纠正的评论）。
3. 打开本任务的 openspec change → 应看到矛盾结论对的取证结论与定性（双实例 / 伪装 / 误读三选一或其他），及据此裁剪的修复范围说明。

### Accepted QA additions

1. 构造同一 active issue 由 idle scan `changed` job 命中、最新外部无 mention comment → 应执行一次兜底路由；构造 idle issue 同样输入 → 不执行兜底路由。
2. 构造兜底路由 `append` / `no_action` / `fail_open` 三种结果 → intake state 均按 comment id 记录 outcome；同一 comment id 第二轮均不再调用路由判定。
3. 构造 append body 中无 mention、多 mention、未知 mention、`@ceo`、仅代码块内 mention → parser 必须 fail-open，不发布评论。
4. 任取所有 runner 可见发布路径各一条 → body 均包含 `ceo-reviewed` 或明确 bypass/not-applicable reason；`ceo-corrected` 只出现在 replace/append 修正子类。
5. 旧 `.state/github-response-intake.json` 缺少新增兜底字段时仍可加载与折叠；新增 `ceo-reviewed` metadata 不改变 speaker 归一化。
6. 注入兜底路由调用永久不 settle 或超过测试超时预算 → 处理 active 最新外部无 mention comment → issue job 应有界 settle，记录该 comment id 的 `fail_open`，不发布 append，后续心跳不被阻塞，同一 comment id 第二轮不再调用路由判定。测试可用 fake route promise / timeout 注入，不要求真实挂起外部进程。
7. 构造 fallback append body 的唯一 mention 只出现在 inline code 中，例如正文只有 `` `@dev` `` → parser 必须判为 `fail_open`，不发布评论，并记录该 comment id outcome。

## Tradeoffs

- The fallback route ledger records fail-open decisions as consumed. This can miss one useful route attempt after a transient CEO failure, but it bounds cost and prevents repeated comments for the same external text.
- The fallback route does not live in `src/triggers/` because it needs active issue state, comment ids, and publishing decisions that triggers must not depend on.
- The implementation does not add a global anti-forgery mechanism for all role envelopes. T8 improves future auditability; it does not retroactively prove issue 41 causality.
- Route append is `ceo` role-envelope output to preserve auditability and reuse normal mention handling on the next active poll.

## Risks

- A too-broad route prompt could create noisy CEO append comments. Mitigation: TypeScript only permits one valid mention, persona requires clear route intent, and the ledger prevents repeated attempts.
- A too-strict parser could fail-open on useful route text. Mitigation: fail-open preserves current behavior and is recorded for audit.
- Adding metadata by hand at many call sites can drift. Mitigation: implement small helper functions at publish boundaries and cover each path with tests.
- Old local state files must keep loading. Mitigation: new fields are optional and loader tests cover absent fields.
