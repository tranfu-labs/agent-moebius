# Design: e2e-milestone-2-t7

## Plan

### 1. Evidence scope

The current T7 issue is the main drill object. The implementation record will use its own timeline as the acceptance loop: dev produces a `code-verified` comment with artifact evidence, CEO routes implementation validation, and the product-manager references that evidence during walkthrough.

Issue 48 is only supporting historical evidence. It can be cited as proof that earlier Milestone 2 roles, run manifests, and artifact publication paths were exercised, but it does not replace the current issue's acceptance loop.

### 2. Observer evidence

Run the observer with the supported command:

```sh
pnpm observer
```

Use a non-default port if the default is occupied. The drill must produce an observer evidence image in the worktree, even when the observer cannot show the current issue. Save either the real current-issue observer view or a diagnostic observer screenshot to:

```text
artifacts/acceptance/m2-t7-observer.png
```

If local `config.local.toml` does not include the current drill repository, do not commit that file. If a temporary local config is needed to inspect the page, keep it local-only and restore or leave it untracked according to the pre-existing local state. If the observer cannot show the current issue before the final `code-verified` run manifest exists, the screenshot must show the available observer diagnostic state and the roadmap record must list the limitation as a not-closed card point. The post-comment acceptance check remains: after the final comment is published, the product-manager opens observer and verifies whether the current T7 issue shows the `code-verified` stage and screenshot artifact link or a clear unpublished / configuration diagnostic.

### 3. Controlled `gh` fault injection

Create a temporary directory outside the repository containing fake `gh` executables. Prepend that directory to `PATH` only for bounded runner invocations. The runs must not modify source code and must not commit local configuration.

Use two fault modes when local configuration makes them safe to run:

1. **Fast failure mode**: fake `gh` exits quickly with an EOF / transient network-looking failure. Success criteria: the runner records retry or failure scheduling, no half-complete agent comment is posted, and the relevant intake `updatedAt` does not advance. If local config does not drive the current issue through GitHub access, record that limitation instead of claiming this criterion passed.
2. **Hang mode**: fake `gh` sleeps longer than the GitHub CLI single-call timeout budget. The external process timeout is only a guardrail for the experiment; it is not the success signal. Success requires observing the runner's own GitHub CLI timeout / transient failure handling before the external guard terminates the process. If the external guard fires first, record the hang-mode result as inconclusive and list it as a card point.

After a fast-failure run, remove the PATH mask and run a recovery heartbeat only if doing so will not create duplicate live agent execution on the current issue. Recovery success criteria: the same issue can continue processing after the mask is removed and leaves a visible result, with no duplicate half-complete comments from the failure run. If running a live recovery heartbeat is unsafe because the current issue would trigger another Codex driver, record that boundary and use the outer runner's successful publication of this T7 `code-verified` comment plus the observer manifest as the recovery evidence.

Do not intentionally force the dead-letter path unless recovery cannot be observed safely and the user / product-manager has accepted the extra visible comments. If the dead-letter branch is chosen, run until `FAILURE_RETRY_LIMIT` is reached, then verify the dead-letter comment is visible and contains no agent mention.

The drill record must capture:

- the temporary PATH mask boundary;
- whether the runner attempted GitHub access;
- observed fast-failure behavior;
- observed hang-mode timeout behavior or why it was inconclusive;
- observed recovery behavior or the reason recovery was deferred to the outer runner publication;
- dead-letter behavior only if that branch was intentionally exercised;
- whether the result was limited by local observer / whitelist configuration.

If the local whitelist does not cause a meaningful GitHub call during the bounded run, record that as a card point rather than changing committed configuration.

### 4. Roadmap record

Append a T7 drill record under `docs/roadmap/milestone-2-stability-oracle.md`. The record should include:

- current T7 issue as the primary drill object;
- issue 48 as historical supporting evidence only;
- observer screenshot or observer limitation;
- `gh` fast-failure, hang-timeout, recovery, or dead-letter observations with explicit pass / inconclusive labels;
- card points, including any T5 state mismatch;
- M3 candidate follow-ups.

Only check T7 after the recorded evidence is sufficient for the product-manager to validate the three official acceptance statements. Do not change T5 status.

### 5. Verification

Run:

```sh
git diff --check
pnpm test
pnpm typecheck
```

For the final `code-verified` response, include an `## 验收证据` section with worktree-relative artifact paths for any generated screenshots, so the publisher can discover them.

## QA Review Response

QA's proposed extra checks are treated as test-design suggestions until the product-manager or a human user explicitly accepts them into the official acceptance list. This plan does not auto-promote them to formal acceptance statements.

The plan nevertheless incorporates the following branches to address QA's defects:

- A mandatory observer / diagnostic screenshot is always generated and referenced.
- Fast EOF / network failure has explicit no-advance and no-half-comment criteria.
- Hang-mode fake `gh` distinguishes runner-owned timeout evidence from the external experiment timeout.
- Recovery is explicitly checked after removing the PATH mask when safe; otherwise the limitation is recorded and the outer runner's successful final publication becomes the recovery evidence.
- Dead-letter validation is optional and only exercised intentionally, because it creates visible comments and may exceed the original "one injected fault" scope.

## Acceptance Statements

The official acceptance statements are kept exactly as supplied by the requirement owner; this plan does not narrow, merge, or replace them.

1. 打开演练 issue → 时间线应包含带截图链接的 `code-verified` 评论与验收角色引用该证据的逐条走查结论。
2. 打开观察页 → 应看到该 issue 的阶段与证据全景。
3. 本文件应追记演练记录，含故障注入的自愈观察与卡点清单（可为空）。

## Tradeoffs

- The drill prioritizes evidence and traceability over changing behavior. Any rule defect found during the drill becomes a recorded card point or M3 candidate.
- The observer screenshot may be taken before the final run manifest for this same `code-verified` comment exists. The final acceptance check remains the product-manager opening the observer after the comment has been published.
- A fake `gh` PATH mask is safer than disabling the real CLI globally because its scope is limited to one bounded runner process.
- Recovery is preferred over forcing dead-letter because the original T7 requirement asks for one injected `gh` fault and self-healing observation, not deliberate exhaustion of the failure budget.

## Risks

- Local whitelist or state may not include the current issue. Mitigation: record the gap and use available manifest / observer state, without committing local configuration.
- The bounded runner process could be long-running. Mitigation: run it with an explicit external timeout as an experiment guard only; do not count the guard firing as proof of runner self-healing.
- The timeline evidence that proves acceptance statement 1 requires the product-manager's post-delivery walkthrough. Mitigation: dev will provide artifact evidence in `code-verified`; product-manager validation completes the loop on the same issue timeline.
- A live recovery heartbeat could duplicate Codex execution on the current issue. Mitigation: run it only if the local setup can prevent duplicate visible work; otherwise record the boundary and rely on the outer runner publication path for recovery evidence.
