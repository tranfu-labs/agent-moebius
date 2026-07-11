# Console Page Wireframe

The console page is the Electron desktop shell's default main window. It is a local operator console backed by the local console server and SQLite. Status and observer pages remain auxiliary diagnostics, and their current presentation facts are documented in this file rather than a separate observer page fact source.

## Running

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Moebius                       1 运行中 · 0 等你            [诊断] [新会话] │
├────────────────────┬──────────────────────────────────────┬────────────────┤
│ ▾ agent-moebius     │ 会话: 本地 T4 验收                 运行中│ 运行详情       │
│  »  本地 T4 验收    │                                      │ runDir          │
│     ├─ 子会话 · 编排│ ┌ 你 · 14:02 ─────────────────────┐ │ /tmp/.../run-1  │
│     └─ 子会话 · 路由│ │ dev 帮我验证本地操作台直播       │ │                │
│     失败构造验证    │ └──────────────────────────────────┘ │ 最近输出        │
│     卡住状态验证    │                                      │ running tests... │
│     空白会话        │                                      │                │
│                    │ ┌ 开发 · 运行中 00:43 ─── [中断] ┐ │                │
│                    │ │ 正在运行 · stdout.jsonl 已更新   │ │ 状态           │
│                    │ │ runDir: /tmp/agent-moebius...    │ │ running        │
│                    │ │ 最近输出: running tests...       │ │                │
│                    │ └──────────────────────────────────┘ │ 错误记录       │
│                    │                                      │ 无              │
│                    ├──────────────────────────────────────┤                │
│                    │ [ 输入消息，选择一个角色交棒... ][发送]│                │
└────────────────────┴──────────────────────────────────────┴────────────────┘
```

Requirements:
- The left side keeps project -> parent session -> child session hierarchy when `parentSessionId` is present.
- Root and child rows use the same selection model; child rows are compact and indented under their parent.
- A renderer refresh restores the hierarchy from flat session summaries alone.
- Missing, self-parented, or cyclic parent references do not hang rendering; each session appears at most once and unsafe children fall back as root rows.
- The middle timeline mixes user, agent, and system records.
- The active run block always displays a non-empty summary, elapsed time, and runDir when available.
- Tail-read timeout, missing files, or unparseable output display a deterministic fallback and optional diagnostic text, never a blank running block.

## Interrupted

```text
┌ 开发 · 已中断 · 14:03 ───────────────────────────────┐
│ 用户已中断本轮运行。                                │
│ runDir: /tmp/agent-moebius-local-...                 │
│ 状态: interrupted                                    │
└──────────────────────────────────────────────────────┘

[ 输入消息，选择一个角色交棒... ][发送]
发消息会开启新一轮运行。
```

Requirements:
- Interruption is a neutral fact, not an error failure.
- The composer becomes usable again after interruption.

## Failed

```text
┌ 系统 · 本地错误 · 14:08 ─────────────────────────────┐
│ Codex 运行失败: exit-code-1                          │
│ runDir: /tmp/agent-moebius-local-...                 │
│ stderr: fake codex failed for acceptance             │
└──────────────────────────────────────────────────────┘
```

Requirements:
- Failures appear in the timeline as local system records and remain visible after refresh.
- Fake Codex non-zero exit and spawn errors use the failed path; user interruption does not.

## Stuck

```text
┌ 系统 · 运行卡住 · 14:12 ─────────────────────────────┐
│ Codex 运行卡住: idle-timeout:300000ms                │
│ runDir: /tmp/agent-moebius-local-...                 │
│ 状态: stuck                                          │
└──────────────────────────────────────────────────────┘
```

Requirements:
- Stuck is distinct from failed and interrupted.
- Timeout and stale-running repair records keep reason and runDir visible after refresh or window restart.

## Diagnostics

```text
[诊断]
  打开状态页
  打开观察页
  打开数据目录
```

Requirements:
- Status and observer pages are reachable as diagnostics, but the operator console is the default main window.

## Auxiliary Read-only Observer

The observer remains a separate, local read-only diagnostic page reachable from the console or through `pnpm observer`. It uses `.state/goal-ledger.json` as the primary data source when available, rendering a goal -> milestone -> task tree with phase summaries, gate visibility, task evidence, unlinked runs, diagnostics, and legacy issue/run records as a secondary area.

Desktop:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Agent Moebius Observer                                      read on load   │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Goals                        │ Diagnostics                                 │
│                              │  goal-ledger.json          ok               │
│  M3 orchestration            │  run-manifests.jsonl       partial          │
│   active · waiting gates 2   │   line 8 skipped: invalid JSON              │
│                              │  filtered ledger goals     1 not watched    │
│  filtered goals 1 not watched│                                             │
│  Unlinked local runs 3       │ Goal ledger tree                            │
│                              │  Goal M3 orchestration                       │
│ Legacy issue records         │   quality data-correct                       │
│  tranfu-labs/agent-moebius   │   active phase: Build observable orchestration│
│   issue 75 latest plan       │   gate waiting product-manager integration  │
│                              │    basis integration event requested         │
│                              │    next tranfu-labs/agent-moebius issue 75  │
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
│ Goals                        │ Diagnostics                                 │
│  ledger unavailable          │  goal-ledger.json          error            │
│                              │   unsupported schemaVersion                 │
│ Legacy issue records         │                                             │
│  tranfu-labs/agent-moebius   │ Goal ledger tree                            │
│   issue 75 latest run        │  账本读取失败，树视图暂不可用。             │
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

Requirements:
- The observer remains auxiliary and read-only; it is not the default desktop main-window experience.
- The primary diagnostic view is ledger-first when the ledger is valid, while malformed, missing, or timed-out ledger reads preserve legacy issue/run records.
- Goal filtering, owner phase states, gate visibility, explicit run evidence, unlinked runs, artifact links, and malformed-state diagnostics remain visible without exposing full issue bodies, hidden keys, secrets, or full run manifest JSON.
- The observer provides no operation buttons, file watcher, GitHub/Codex/publisher calls, state writes, or runner control capability.

## T6 Flat Component Anchor

```text
┌────────────────────┬─────────────────────────────────────────────────────────┐
│ Project/session nav│ 会话: 本地 T6 验收                         [running]   │
│ remains navigation │                                                         │
│                    │ ┌ 运行直播 [running] 00:43 ─────────────── [中断] ┐    │
│                    │ │ runDir: /tmp/agent-moebius-t6-run             │    │
│                    │ │ cwd: /tmp/agent-moebius-local-worktree        │    │
│                    │ │ live tail from codex                          │    │
│                    │ └───────────────────────────────────────────────┘    │
│                    │ ┌ dev [completed] 23:01:00 ─────────────────────┐    │
│                    │ │ 已完成组件回收。                              │    │
│                    │ └───────────────────────────────────────────────┘    │
│                    │ ┌ system [failed] 23:01:00 ─────────────────────┐    │
│                    │ │ Codex failed: exit:42                         │    │
│                    │ └───────────────────────────────────────────────┘    │
└────────────────────┴─────────────────────────────────────────────────────────┘
```

Requirements:
- Main-content live run blocks and timeline messages use the shared `Card` primitive: square or near-square corners, thin border, compact padding, neutral surface, and no floating shadow.
- Session and message status labels use the shared `Badge` primitive with runtime status semantics.
- Waiting and pending statuses remain neutral structural facts; failed and stuck statuses use danger fact styling; interrupted stays neutral and distinct from failure.
- Main content does not keep native `article` timeline shells or hand-written `border border-line` card/badge containers.
- Sidebar project/session rows remain navigation controls, not Card surfaces.
