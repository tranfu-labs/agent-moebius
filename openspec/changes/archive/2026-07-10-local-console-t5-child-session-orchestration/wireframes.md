# Wireframes：local-console-t5-child-session-orchestration

## pages/operator-console-sidebar.md

基线：当前 desktop operator console sidebar 已按 `project -> session` 平铺展示；本 change 只增加 `parent_session_id` 可用时的第二层 child session 缩进。

```text
┌──────────────────────────────┐
│ Projects                 +   │
│ runner running               │
├──────────────────────────────┤
│ moebius             ⎇  │
│ /Users/wing/...              │
│ worktree                     │
│                              │
│ ● T5 parent goal             │
│   进行中                     │
│   ├─ ○ child orchestration   │
│   │  等待真人                │
│   └─ ✓ local routing bus     │
│      已完成                  │
│                              │
│ ○ Scratch session            │
│   空闲                       │
└──────────────────────────────┘
```

规则：

- root session 使用现有 session row 高度和状态点。
- child session 缩进一级，字号不大于 root row，不换行挤压状态。
- selected child session 使用同一个 selected background token。
- 刷新后层级完全由 `parentSessionId` 恢复。
- 若输入存在 missing parent、self-parent 或 parent cycle，侧栏不展示循环；每个 session 至多出现一次，无法安全归属的 child 回退为 root row 并保持可选。
