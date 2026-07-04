# github-issue-runner spec delta

## Added

- MUST route active issue latest external no-mention comments through a bounded stateless fallback route judgment after ordinary mention trigger returns `no-trigger`, when the latest message is a GitHub comment normalized as `speaker=user`, contains no runner machine metadata, contains no valid agent mention outside Markdown code areas, and the comment id has not already been judged.
- MUST NOT run fallback routing for issue body messages, idle issues, runner role-envelope comments, dead-letter comments, comments with any valid agent mention, comments whose only mention appears inside Markdown code, or comments whose id was already recorded in the fallback route ledger.
- MUST allow idle repository scans to discover a changed issue whose existing intake state is active and still treat that issue as active for fallback routing; changed idle issues MUST NOT run fallback routing.
- MUST record fallback route decisions by GitHub comment id in intake state with outcome `no_action`, `append`, or `fail_open`, judged time, and optional target role / reason.
- MUST record failed or malformed fallback route judgments as `fail_open` and MUST NOT repeatedly judge the same comment id on later polls.
- MUST keep existing fail-open behavior when fallback route judgment fails, times out, is cancelled, or never settles past the injected route timeout budget: no append comment is posted, issue processing can still fold as no-trigger / visible ack according to the selected outcome, and the issue job plus later heartbeats do not block indefinitely.
- MUST validate fallback route append output structurally in TypeScript: append body is non-empty, contains exactly one valid ordinary agent mention outside Markdown code areas, targets a known Codex agent, and does not target `ceo`.
- MUST keep fallback route business criteria in `agents/ceo.md`; TypeScript MUST NOT hard-code semantic routing rules beyond structure and role validation.
- MUST publish fallback route append comments as `ceo` role-envelope comments.
- MUST add auditable CEO review metadata to all runner-published role-envelope comments. Comments that passed through CEO guardrail MUST record the guardrail action; comments that intentionally bypassed or are not applicable to CEO review MUST record an explicit bypass / not-applicable reason.
- MUST keep `ceo-corrected` metadata as the subclass marker for CEO replace / append correction paths only.
- MUST ensure new CEO review metadata does not change speaker normalization; `agent-moebius:role=...` remains the role-envelope speaker source.
- MUST keep old `.state/github-response-intake.json` files valid when the fallback route ledger field is absent.

## Added scenarios

- Scenario: Active external no-mention comment is judged once
  Given an issue is active in intake state
  And its latest GitHub comment normalizes to `speaker=user`
  And the comment body has no valid agent mention and no runner metadata
  And the comment id has no fallback route decision recorded
  When the ordinary mention trigger returns `no-trigger`
  Then runner calls fallback route judgment once
  And records the comment id outcome in intake state
  And a second processing round for the same comment id does not call fallback route judgment again.

- Scenario: Fallback append produces a CEO route comment
  Given fallback route judgment returns append text with exactly one valid agent mention
  When runner processes the active no-mention external comment
  Then runner posts a `ceo` role-envelope comment containing that append text
  And the comment has auditable CEO review metadata with a not-applicable fallback-route reason.

- Scenario: Fallback no action leaves an audit record only
  Given fallback route judgment returns `no_action`
  When runner processes the active no-mention external comment
  Then no route append comment is posted
  And intake state records `no_action` for that comment id.

- Scenario: Malformed fallback output fails open once
  Given fallback route judgment returns invalid JSON, empty append body, multiple valid mentions, unknown role mention, `@ceo`, no valid mention, fenced-code-only mentions, or inline-code-only mentions
  When runner validates the output
  Then no comment is posted
  And intake state records `fail_open` for that comment id
  And later processing of the same comment id does not re-run judgment.

- Scenario: Fallback route judgment is bounded
  Given fallback route judgment never settles or exceeds an injected test timeout budget
  And the active issue latest external comment has no valid mention
  When runner processes the issue
  Then the issue job settles within the configured route timeout path
  And intake state records `fail_open` for that comment id
  And no append comment is posted
  And a later heartbeat is not blocked by the stuck route call
  And later processing of the same comment id does not re-run judgment.

- Scenario: Idle changed issue does not use fallback routing
  Given an idle issue is discovered by repository idle scan as changed
  And its latest external comment has no valid mention
  When runner processes the changed issue
  Then fallback route judgment is not called
  And ordinary `no-trigger` behavior is preserved.

- Scenario: CEO review metadata covers all visible role-envelope publish paths
  Given runner publishes any role-envelope comment from an agent response, CEO replace, CEO append, media failure, artifact failure, or fallback route append
  When the comment body is inspected
  Then it contains `ceo-reviewed` metadata or an explicit bypass / not-applicable reason
  And `ceo-corrected` appears only for CEO replace / append correction subclasses.
