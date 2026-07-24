# 线框：read-only-observer-t4

## 基线
当前仓库没有既有 `docs/wireframes/` 页面基线；本 change 建立 observer v0 的首版只读页面线框。归档时回流到 `docs/wireframes/pages/observer.md` 与 `docs/wireframes/flow.md`。

## pages/observer.md

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Whitelisted repositories      │ Diagnostics                                 │
│                              │  config.local.toml        ok                 │
│ tranfu-labs/moebius    │  github-response-intake   ok                 │
│  issue 50                    │  run-manifests.jsonl      partial            │
│   latest run: plan-written   │   line 7 skipped: invalid JSON               │
│   intake: active             │                                             │
│  issue 48                    │ Issue tranfu-labs/moebius#50           │
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
│ Moebius Observer             │
│ read on load                       │
├────────────────────────────────────┤
│ Diagnostics                        │
│ run-manifests.jsonl partial        │
├────────────────────────────────────┤
│ Whitelisted repositories           │
│ tranfu-labs/moebius          │
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
