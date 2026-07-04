# Proposal: e2e-milestone-2-t7

## Background

Milestone 2 needs a final manual drill that proves the stability, artifact, observer, and collaboration rules work together on a real GitHub issue timeline. The roadmap task T7 is explicitly non-code work: it records an end-to-end exercise, captures evidence, and routes any rule gaps into future work instead of fixing rules in place.

The product-manager confirmed the drill scope:

- Use the current T7 issue as the primary closed-loop object.
- Treat issue 48 only as historical collaboration evidence, not as this round's main acceptance thread.
- Use a controlled PATH mask / fake `gh` fault injection for one bounded runner heartbeat.
- Do not commit local `config.local.toml`.
- If observer configuration does not include the drill repository, record that as a card point and use available manifest / observer evidence.
- Do not change runtime code and do not fix T5 status in this task.

## Proposal

Run the T7 manual drill and record it without changing runtime code:

1. Collect timeline and historical evidence from the current T7 issue and issue 48.
2. Start the read-only observer locally, capture available issue / artifact / manifest evidence as a worktree-relative artifact when possible, and record any local configuration gap.
3. Inject a controlled `gh` failure using a temporary PATH mask / fake `gh`, run one bounded runner heartbeat, and record observed retry / recovery / dead-letter behavior without committing local configuration.
4. Append the drill record to `docs/roadmap/milestone-2-stability-oracle.md` under T7, including evidence links or artifact paths, fault-injection observations, card points, and M3 candidate follow-ups.
5. Verify with formatting and project checks, then publish a `code-verified` response that explicitly references the acceptance artifact path if one is generated.

## Impact

- Affected documents: `docs/roadmap/milestone-2-stability-oracle.md`.
- Affected local-only artifacts: `artifacts/acceptance/` may receive observer or drill screenshots intended for publisher discovery.
- No runtime code changes.
- No behavior spec changes.
- No committed local `config.local.toml`.
- No change to T5 status; inconsistencies are recorded as card points or M3 candidates only.
