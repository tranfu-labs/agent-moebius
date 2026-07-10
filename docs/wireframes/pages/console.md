# Console Page Wireframe

The console page is the Electron desktop shell's default main window. It is a local operator console backed by the local console server and SQLite. Status and observer pages remain auxiliary diagnostics.

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
