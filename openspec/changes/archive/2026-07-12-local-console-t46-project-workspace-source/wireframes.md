# Wireframes：local-console-t46-project-workspace-source

Baseline: `docs/wireframes/pages/console.md`.

## pages/console.md

### Project list with open-folder and worktree mode

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Moebius                       1 运行中 · 0 等你       [打开文件夹] [诊断] │
├──────────────────────┬──────────────────────────────────────┬──────────────┤
│ Projects             │ 会话: T4.6 worktree 验收            运行中│ 运行详情     │
│ ▾ moebius      │                                      │ cwd          │
│   /Users/.../moebius │ ┌ 你 · 14:02 ─────────────────────┐ │ /tmp/...wt  │
│   worktree 开        │ │ @dev 写入 marker                 │ │              │
│  »  T4.6 worktree    │ └──────────────────────────────────┘ │ runDir       │
│     非 git 降级      │                                      │ /tmp/...run  │
│                      │ ┌ 开发 · 运行中 00:13 ─── [中断] ┐ │              │
│ ▾ notes              │ │ 正在运行，等待输出              │ │ workspace    │
│   /Users/.../notes   │ │ cwd: /tmp/.../local-worktrees/...│ │ worktree     │
│   worktree 不可用    │ └──────────────────────────────────┘ │              │
│   not-git-repository │                                      │              │
│     默认会话         ├──────────────────────────────────────┤              │
│                      │ [ 输入本地对话消息，例如 @dev ... ][发送]│          │
└──────────────────────┴──────────────────────────────────────┴──────────────┘
```

Requirements:
- The sidebar renders persisted projects first, then each project's sessions.
- Project title is the selected folder basename, not a hard-coded product name.
- The open-folder action is a toolbar command.
- Worktree mode is visible at the project row level.
- `not-git-repository` is shown as a neutral project workspace status, not as a failed run.
- The active run details expose cwd/workspace mode so acceptance can verify where Codex ran.

### Direct mode

```text
│ ▾ moebius      │ 会话: 原地修改验证                  空闲│ 运行详情     │
│   /Users/.../moebius │                                      │ cwd          │
│   worktree 关        │ ┌ 开发 · 已完成 ──────────────────┐ │ /Users/...   │
│  »  原地修改验证     │ │ 已在原目录写入 marker            │ │ workspace    │
│                      │ └──────────────────────────────────┘ │ direct       │
```

Requirements:
- Direct mode clearly differs from worktree mode.
- The UI does not imply rollback/isolation when worktree mode is off.
