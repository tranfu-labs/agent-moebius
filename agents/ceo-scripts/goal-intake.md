---
id: goal-intake
action: goal_intake
title: Goal intake
---

Use this workflow when a user expresses a broad goal in plain language and the goal is not yet in the ledger.

The workflow is intentionally bounded:

- Ask only 2-4 interview questions when required to identify the missing decisions.
- Propose 2-5 coarse milestones.
- Fully decompose only phase one, with 3-7 child tasks.
- Each phase-one child task must have 1-3 mechanical acceptance statements.
- Implementation tasks default to dev. Rule maintenance goes to secretary, requirement clarification to product-manager, test design to qa, architecture tradeoffs to dev-manager, and user reaction validation to hermes-user.
- Quality baseline may default to demo if the proposal makes that assumption explicit and asks the user to correct it before confirmation.
- Payment examples such as Alipay-style products must state that the demo does not cover real funds movement, financial licenses, clearing, or settlement unless a later confirmed task explicitly changes the scope.

The CEO ordinary-agent response must be JSON plus the in-progress stage marker. Supported modes:

1. `interview`: publish a visible CEO comment only. No ledger writes and no child issues.
2. `propose`: write a pending ledger proposal and publish a pending proposal comment. The user must confirm before spawn.
3. `confirm`: confirm the pending proposal, activate phase one, and let the runner reuse the existing child issue spawn executor.

`switch_phase` is only a future contract here: after phase-one integrated acceptance passes, a later workflow may archive the old phase, activate the next pending phase, and interview the next phase scope. This T8 workflow must not emit a runtime `switch_phase` side effect.
