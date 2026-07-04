# Proposal: external-comment-fallback-ceo-audit-t8

## Background

Milestone 2 T8 addresses two runner deadlock gaps and one evidence gap observed during dogfood:

- An active issue can receive a new external comment with no valid agent mention. Today the mention trigger returns `no-trigger`, advances intake state, and the collaboration loop can stop even when the human text clearly intends to route work.
- Runner-published comments are not all auditable as CEO-reviewed. Only corrected comments include `ceo-corrected`, so a visible role envelope without correction metadata cannot prove whether the CEO guardrail reviewed it.
- Issue 41 contains product-manager conclusion pairs that contradict each other within 19 and 44 seconds while carrying runner role metadata. The available evidence must be classified before expanding this task into process-level locking or protocol enforcement.

The product-manager confirmed the scope:

- "External comment" means the latest normalized message is `speaker=user` and the comment has no runner machine metadata. Runner dead letters, CEO append comments, and agent role-envelope comments are excluded.
- Fallback route appends must be posted as `ceo` role-envelope comments.
- A new unified metadata marker such as `<!-- agent-moebius:ceo-reviewed action=no_change -->` is acceptable. `ceo-corrected` remains the corrected-subclass marker.
- Intake state may be extended by comment id to record fallback route outcome and prevent repeated judgment.
- Fallback routing is active-only and only applies to the latest external comment with no valid mention.
- TypeScript validates structure and known roles only; route judgment criteria live in `agents/ceo.md`.

## Proposal

Implement T8 in the existing runner boundaries:

1. Add an active-only fallback route path after the ordinary mention trigger returns `no-trigger` for the latest external comment. The route path calls a lightweight CEO-style stateless judgment that returns either `no_action` or one `append` body with a single valid agent mention.
2. Extend GitHub response intake state with a per-comment fallback route ledger keyed by GitHub comment id. The ledger records outcome (`no_action`, `append`, or `fail_open`), judged time, and optional target role / reason, so the same comment is judged once.
3. Add uniform CEO review audit metadata for all runner-published role-envelope comments. Comments that actually pass through CEO guardrail record the guardrail action; visible comments that intentionally bypass CEO record a `bypass` / `not_applicable` reason.
4. Keep `ceo-corrected` only for CEO replace / append correction subclasses.
5. Update `agents/ceo.md` with the fallback route judgment contract and criteria, without moving route policy into TypeScript.
6. Preserve issue 41 evidence classification in this change: existing issue metadata shows contradictory PM conclusion pairs, but local raw runner logs are unavailable, so the fix scope is limited to auditability and fallback routing rather than T1/T2 expansion.

## Impact

- Runtime modules: `src/runner.ts`, `src/format-ceo.ts`, `src/github-response-intake.ts`, `src/github-intake-state.ts`, and tests.
- Persona: `agents/ceo.md`.
- Specs / docs: `openspec/specs/github-issue-runner/spec.md`, this change, and final roadmap evidence under `docs/roadmap/milestone-2-stability-oracle.md`.
- No new trigger type is added to `src/triggers/`; ordinary mention resolution remains isolated there.
- No GitHub or Codex adapter dependency is added to `github-response-intake.ts`.
