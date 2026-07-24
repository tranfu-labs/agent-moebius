# Wireframes：console-ui-flat-anchor

Baseline: `docs/wireframes/pages/console.md`.

## pages/console.md

### Main content using shared Card and Badge

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Projects                       会话: 本地 T6 验收              [running]   │
├──────────────────────┬───────────────────────────────────────────────────────┤
│ ▾ moebius      │ ┌ 运行直播                                      ┐  │
│   worktree 开        │ │ [running] 00:43                               │  │
│  »  T6 扁平锚        │ │ runDir: artifacts/...                         │  │
│     子会话导航行      │ │ cwd: /tmp/...                                  │  │
│                      │ │ stdout summary                                │  │
│                      │ └───────────────────────────────────────────────┘  │
│                      │ ┌ user [displayed] 14:02                         │  │
│                      │ │ 请把 console-ui 组件锚点收敛到扁平语言          │  │
│                      │ └───────────────────────────────────────────────┘  │
│                      │ ┌ dev [completed] 14:08                          │  │
│                      │ │ 已完成组件回收并提供验收证据                   │  │
│                      │ └───────────────────────────────────────────────┘  │
│                      ├───────────────────────────────────────────────────────┤
│                      │ [ 输入本地对话消息，例如 @dev ... ][发送]          │
└──────────────────────┴───────────────────────────────────────────────────────┘
```

Requirements:

- Live run block and timeline messages are flat shared `Card` surfaces.
- Status labels are shared `Badge` surfaces with status semantic variants.
- Cards use thin borders and tight padding; no floating card shadow is introduced.
- Sidebar project/session rows remain navigation controls, not Card surfaces.
- The main content does not contain native `article` timeline shells or hand-written `border border-line` card/badge containers.

### Status Badge semantics

```text
[running] [waiting] [failed] [stuck] [interrupted] [idle] [pending] [completed] [displayed]
```

Requirements:

- `running` is the only interaction-accent status.
- `failed` and `stuck` are danger facts.
- `waiting` and `pending` are neutral structural facts.
- `interrupted`, `idle`, `completed`, and `displayed` are neutral facts.
- Acceptance pass/fail verdict colors remain outside runtime status Badge semantics.
