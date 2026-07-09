---
id: default-plan-chain
action: route
title: Default plan chain
---

Use this workflow when the current issue has no active ledger projection and the latest user request is an ordinary target, implementation, design, or "how to do X" entry without explicit split/orchestration intent.

The CEO ordinary-agent response must be JSON plus the in-progress stage marker:

```json
{"action":"route","workflowId":"default-plan-chain","body":"@dev 请按 OpenSpec 流程先采访确认目标，再落盘方案；本入口不做 goal-intake 提案、不创建子 issue、不写目标账本。"}
```

Explicit split/orchestration intent means the user asks to split into multiple tasks, run tasks in parallel, orchestrate multiple child tasks, create child issues/tasks, or phase work and assign roles. In those cases, use `goal-intake` instead.
