# 线框：observer-ledger-ui-t7

基线：`docs/wireframes/pages/observer.md`。

## pages/observer.md

Desktop:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Goals                         │ Diagnostics                                 │
│                              │  goal-ledger.json          ok                │
│  ● Goal: M3 orchestration     │  run-manifests.jsonl       partial           │
│    active: phase-m3-build     │   line 8 skipped: invalid JSON               │
│    waiting gates 2           │  filtered ledger goals     1 not watched     │
│    errors 0                  │                                             │
│                              │ Goal M3 orchestration                         │
│  Unlinked local runs 3       │  quality data-correct                         │
│                              │  active phase: Build observable orchestration │
│ Legacy issue records         │  gate: waiting product-manager integration    │
│  tranfu-labs/moebius   │   basis: integration event requested          │
│   issue 75 latest plan       │   next: tranfu-labs/moebius issue 75    │
│                              │                                             │
│                              │  Milestone: orchestration runtime             │
│                              │   active phase: child execution               │
│                              │   ▸ pending/completed phases                  │
│                              │   Task T7 observer ledger UI                  │
│                              │    readiness ready · baseline data-correct    │
│                              │    deps T1,T2,T4,T6                           │
│                              │    child issue 81 open                        │
│                              │    latest acceptance: failed by qa            │
│                              │    run evidence: .state/run-manifests line 12 │
│                              │                                             │
│                              │  未归属里程碑任务                             │
│                              │   Task repair follow-up                       │
│                              │    no active phase                            │
│                              │    child issue 83 roundtable child            │
│                              │    ref other/repo issue 9 not watched/no poll │
│                              │                                             │
│                              │ Unlinked local runs                           │
│                              │  2026-07-05 dev code-verified issue 70        │
│                              │ Legacy issue/run records                      │
│                              │  issue 75 intake active, role threads, runs   │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Ledger read failure fallback:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Goals                         │ Diagnostics                                 │
│  ledger unavailable           │  goal-ledger.json          error             │
│                              │   unsupported schemaVersion                  │
│ Legacy issue records         │                                             │
│  tranfu-labs/moebius   │ Ledger tree                                  │
│   issue 75 latest run        │  账本读取失败，树视图暂不可用。                │
│                              │                                             │
│                              │ Legacy issue/run records                     │
│                              │  issue 75 intake active                      │
│                              │  runs                                        │
│                              │   published artifact link                    │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Mobile / narrow viewport:

```text
┌────────────────────────────────────┐
│ Moebius Observer             │
│ read on load                       │
├────────────────────────────────────┤
│ Diagnostics                        │
│ goal-ledger.json ok                │
│ filtered goals 1 not watched       │
├────────────────────────────────────┤
│ Goals                              │
│ ● M3 orchestration                 │
│   active phase Build observable    │
│   waiting gates 2                  │
├────────────────────────────────────┤
│ Goal M3 orchestration              │
│ gate waiting product-manager       │
│ next issue tranfu-labs/... issue 75│
│ Milestone orchestration runtime    │
│  Task T7 observer ledger UI        │
│   readiness ready                  │
│   latest acceptance failed by qa   │
│   run evidence jsonl line 12       │
│ 未归属里程碑任务                   │
│  Task repair follow-up             │
│   child issue 83 roundtable child  │
├────────────────────────────────────┤
│ Unlinked local runs                │
│  dev code-verified issue 70        │
├────────────────────────────────────┤
│ Legacy issue/run records           │
│  issue 75 intake active            │
└────────────────────────────────────┘
```

## flow.md

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
