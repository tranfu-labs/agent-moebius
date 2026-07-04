# Wireframe Flow Notes

## Observer

```text
pnpm observer
  │
  ├─ HTTP request / browser refresh
  │    │
  │    ├─ read config.toml + config.local.toml
  │    ├─ read .state/goal-ledger.json
  │    ├─ read .state/github-response-intake.json
  │    ├─ read .state/role-threads.json
  │    ├─ read .state/agent-contexts.json
  │    └─ read .state/run-manifests.jsonl
  │
  ├─ build read-only observer model
  │    ├─ validate / diagnose ledger without writing it
  │    ├─ filter ledger goals by watched repository references
  │    ├─ map goal → milestone → task tree
  │    ├─ map owner phases, gates, child acceptance, integration events
  │    ├─ attach only explicit TaskRecord.runManifestRefs evidence
  │    ├─ keep unrelated run manifests in Unlinked local runs
  │    └─ preserve legacy issue/run records as secondary diagnostics
  │
  └─ render HTML page
       ├─ ledger-first tree view
       ├─ ledger read failure does not break legacy issue/run section
       ├─ no operation buttons
       ├─ no watcher
       ├─ no GitHub / Codex / publisher calls
       └─ no writes to config, .state, manifests, artifacts, releases, or worktrees
```
