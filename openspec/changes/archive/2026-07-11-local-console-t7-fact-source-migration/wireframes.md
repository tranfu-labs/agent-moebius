# Wireframes：local-console-t7-fact-source-migration

Baseline: `docs/wireframes/pages/console.md`.

The default operator console and its auxiliary read-only observer share one current page fact source. The observer remains a separate diagnostic page and runtime process; only its wireframe ownership moves into `pages/console.md`.

## pages/console.md

### Auxiliary read-only observer

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Goals                        │ Diagnostics                                 │
│  M3 orchestration            │  goal-ledger.json          ok               │
│   active · waiting gates 2   │  run-manifests.jsonl       partial          │
│  Unlinked local runs 3       │                                             │
│                              │ Goal ledger tree                            │
│ Legacy issue records         │  Goal M3 orchestration                       │
│  issue 75 latest plan        │   Milestone orchestration runtime            │
│                              │    Task T7 fact-source migration             │
│                              │     latest acceptance passed by qa           │
│                              │     run evidence .state/run-manifests line 12│
│                              │   未归属里程碑任务                           │
│                              │    repair follow-up · no active phase        │
│                              │ Legacy issue/run records                     │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Requirements:
- The observer stays auxiliary and read-only; the operator console remains the default desktop main window.
- Ledger-first diagnostics, fallback states, explicit evidence, artifact links, unlinked runs, and legacy records remain visible.
- Rendering invokes no operation button, watcher, GitHub, Codex, publisher, runner write, or state mutation.

## flow.md

```text
启动桌面应用 → 默认打开本地操作台
  │
  ├─ [诊断] → 辅助状态页
  │    └─ [打开观察页] → observer 动态端口
  │         ├─ read config + .state on request
  │         ├─ render ledger-first tree + legacy diagnostics
  │         └─ no writes / watcher / GitHub / Codex / publisher calls
  │
  └─ pnpm observer → 同一辅助只读观察页
```

Requirements:
- `flow.md` has no standalone Observer primary flow section.
- `docs/wireframes/pages/observer.md` is deleted; `pages/console.md` is the current page fact source.
- The standalone command and desktop diagnostic entry remain valid runtime paths.
