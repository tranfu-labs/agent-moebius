# Observer Page Wireframe

Observer v0 is a local read-only page. It shows the configured repository whitelist, issue status from local state, diagnostics for input files, and run artifact publication status.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Agent Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Whitelisted repositories      │ Diagnostics                                 │
│                              │  config.local.toml        ok                 │
│ tranfu-labs/agent-moebius    │  github-response-intake   ok                 │
│  issue 50                    │  run-manifests.jsonl      partial            │
│   latest run: plan-written   │   line 7 skipped: invalid JSON               │
│   intake: active             │                                             │
│  issue 48                    │ Issue tranfu-labs/agent-moebius#50           │
│   latest run: code-verified  │  latest run stage: plan-written (manifest)   │
│                              │  intake: active, failures 0                  │
│ tranfu-labs/empty-repo       │  role threads                                │
│  no issue records            │   dev lastSeenIndex 4 thread thd_...         │
│                              │  agent contexts                              │
│ tranfu-labs/bad-state        │   dev src/agent-prescripts/dev-workspace.ts  │
│  records partially available │   worktree <worktree>/repo__50__dev          │
│                              │                                             │
│                              │ Runs                                         │
│                              │  2026-07-04T10:30:00.000Z dev plan-written   │
│                              │   artifact:                                  │
│                              │    [image preview]                           │
│                              │    published link                            │
│                              │  2026-07-04T10:00:00.000Z dev in-progress    │
│                              │   unpublished output-artifacts/draft.png     │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Mobile / narrow viewport collapses to a single column:

```text
┌────────────────────────────────────┐
│ Agent Moebius Observer             │
│ read on load                       │
├────────────────────────────────────┤
│ Diagnostics                        │
│ run-manifests.jsonl partial        │
├────────────────────────────────────┤
│ Whitelisted repositories           │
│ tranfu-labs/agent-moebius          │
│  issue 50 latest plan-written      │
│ tranfu-labs/empty-repo             │
│  no issue records                  │
├────────────────────────────────────┤
│ Issue #50                          │
│ latest run stage plan-written      │
│ intake active                      │
│ roles dev lastSeenIndex 4          │
│ runs                               │
│  [image preview] published link    │
│  unpublished output-artifacts/x.png│
└────────────────────────────────────┘
```
