# 提案：multi-agent-primary-control-lanes

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/main-conversation.md | 团队推进中、输入框 | composer 改为主理人专属控制面，新增待发射区；主理人与多个专业 Agent 可并行 | 已写入 |
| docs/product/pages/main-conversation.md | 运行中的操作条、停下 | composer 方形按钮只停主理人，专业 Agent 在各自运行行精确停止 | 已写入 |
| docs/product/pages/main-conversation.md | 说话与提及 | 用户消息始终先交主理人，由主理人决定回复、派工或中断专业 Agent | 已写入 |
| docs/product/pages/main-conversation.md | 指标与验收 #11、#14、#25-#27、#41 | 增加多 active run、主理人 pending 与 runId 级停止验收 | 已写入 |

## 背景

现有产品规则和实现都把本地会话当作单 Agent 单车道：state 只有一个 `activeRun`，session drain 会等待当前 Codex CLI 完成，composer 的方形按钮指向“当前成员”，用户输入后同一按钮又切换成发送。真实团队中主理人需要在专业成员工作时继续接收用户意见、回复用户并决定是否中断成员；多个专业成员也需要并行并分别受控。单一“当前成员”既无法表达控制权，也导致实际 Codex CLI 的停止目标模糊。

## 提案

- 把每段根会话拆成一条主理人控制车道和按专业成员区分的执行车道。
- composer 发送永远进入主理人控制车道；主理人忙时消息保持为持久化 pending，并在 composer 上方展示为待发射区。
- 主理人进入任一终态后自动领取最早 pending；专业成员终态不触发主理人 pending。
- state/API 暴露 `activeRuns`，以 `sessionId + runId` 精确中断；保留单值兼容投影只供过渡，不再作为产品语义。
- UI 为每个专业 Agent 活动行提供自己的停止按钮；composer 方形按钮仅绑定主理人 run，并与发送动作同时存在。
- 主理人回复中的成员 mention 负责派工；命中同一活动成员时先中断旧 run，再用新指令启动该成员。

## 影响

- `src/local-console/runtime.ts`：主理人调度与专业 Agent 执行解耦、多 active run 注册表、pending 发射、精确中断。
- `src/local-console/types.ts`、`server.ts`、SQLite store/fact log：多 run 和 pending 的 API/持久化投影。
- `desktop/src/console-page/*`：多 run state 适配、发送与停止接线、竞态反馈。
- `packages/console-ui/src/console/*`：待发射区、多 RunBlock、专业成员行停止、主理人 composer 停止。
- `tests/`、`desktop/tests/`、console-ui tests/Storybook：调度、持久化、API 与渲染验收。
- `docs/adr/0006-primary-control-and-agent-execution-lanes.md`：记录会话内多车道与精确中断的架构决策。

GitHub-mode runner、GitHub issue mention 协议、子会话隔离、已有附件安全边界不在本 change 中改变。
