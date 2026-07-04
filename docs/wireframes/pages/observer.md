# Observer Page Wireframe

Observer is a local read-only page. It now uses `.state/goal-ledger.json` as the primary data source when available, rendering a goal -> milestone -> task tree with phase summaries, gate visibility, task evidence, unlinked runs, diagnostics, and the legacy issue/run records as a secondary area.

Desktop:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Agent Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Goals                         │ Diagnostics                                 │
│                              │  goal-ledger.json          ok                │
│  M3 orchestration             │  run-manifests.jsonl       partial           │
│   active · waiting gates 2    │   line 8 skipped: invalid JSON               │
│                              │  filtered ledger goals     1 not watched     │
│  filtered goals 1 not watched│                                             │
│  Unlinked local runs 3       │ Goal ledger tree                            │
│                              │  Goal M3 orchestration                       │
│ Legacy issue records         │   quality data-correct                       │
│  tranfu-labs/agent-moebius   │   active phase: Build observable orchestration│
│   issue 75 latest plan       │   gate waiting product-manager integration   │
│                              │    basis integration event requested          │
│                              │    next tranfu-labs/agent-moebius issue 75   │
│                              │                                             │
│                              │   Milestone orchestration runtime            │
│                              │    active phase: child execution             │
│                              │    pending/completed phases                  │
│                              │    Task T7 observer ledger UI                │
│                              │     readiness ready · baseline data-correct  │
│                              │     deps T1,T2,T4,T6                         │
│                              │     child issue 81 open                      │
│                              │     latest acceptance failed by qa           │
│                              │     run evidence .state/run-manifests line 12│
│                              │                                             │
│                              │   未归属里程碑任务                           │
│                              │    Task repair follow-up                     │
│                              │     no active phase                          │
│                              │     child issue 83 roundtable child          │
│                              │     other/repo issue 9 not watched/no poll   │
│                              │                                             │
│                              │ Unlinked local runs                          │
│                              │  2026-07-05 dev code-verified issue 70       │
│                              │ Legacy issue/run records                     │
│                              │  issue 75 intake active, role threads, runs  │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Ledger read failure fallback:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Agent Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Goals                         │ Diagnostics                                 │
│  ledger unavailable           │  goal-ledger.json          error             │
│                              │   unsupported schemaVersion                  │
│ Legacy issue records         │                                             │
│  tranfu-labs/agent-moebius   │ Goal ledger tree                            │
│   issue 75 latest run        │  账本读取失败，树视图暂不可用。              │
│                              │                                             │
│                              │ Legacy issue/run records                    │
│                              │  issue 75 intake active                     │
│                              │  runs                                       │
│                              │   published artifact link                   │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Mobile / narrow viewport:

```text
┌────────────────────────────────────┐
│ Agent Moebius Observer             │
│ read on load                       │
├────────────────────────────────────┤
│ Diagnostics                        │
│ goal-ledger.json ok                │
│ filtered goals 1 not watched       │
├────────────────────────────────────┤
│ Goals                              │
│ M3 orchestration active            │
│ waiting gates 2                    │
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
