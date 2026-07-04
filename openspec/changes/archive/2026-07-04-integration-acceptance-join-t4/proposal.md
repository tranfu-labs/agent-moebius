# T4 Integration Acceptance Join

## Problem
When a parent goal is decomposed into multiple child issues, the runner can observe child-level delivery but has no traceable join point that converts "all children have been formally accepted" into "the parent goal now needs target-level integration acceptance". This can silently conflate child acceptance with goal acceptance, lose failure provenance, or leave failed target-level statements without repair child tasks.

## Scope
- Add child acceptance facts to the goal ledger with bounded provenance.
- Add current-active-phase integration acceptance events to the goal ledger.
- Add a runner pre-pass before mention trigger handling so acceptance role comments are recorded before handoff mentions can be consumed.
- Trigger one parent issue integration acceptance request after all in-scope child issues have passed.
- Route parent target-level failures into repair child issues and rejoin after repair child acceptance.
- Keep side effects bounded, idempotent, and visible on failure.

## Non-Goals
- No worktree provisioning changes.
- No observer write capability or observer UI change.
- No fixed ledger phase or execution stage marker changes.
- No GitHub issue close/open lifecycle synchronization.
- No cross-repository join.
- No T6 round-table or generic fan-out/join topology.
- No manual dogfood workflow.

## Confirmed Acceptance Scope
The formal acceptance list is the 1-18 checklist accepted by product-manager after QA review. QA additions 12-18 are in scope because they cover state-loss and bounded-failure behavior on the same T4 join chain.
