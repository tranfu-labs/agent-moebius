# local-console delta：orphan-run-surfaces-as-stuck

## Requirement: 孤儿运行在重启后被确定性识别为卡住
Source: docs/product/pages/main-conversation.md#三种不可继续状态的共同规则

系统 MUST 在启动 catch-up 时，把 SQLite 标记为 running、但当前进程内存中没有对应活动 run 的本地运行判定为孤儿运行，并确定性落成既有的卡住（stuck）状态：追加带原因的可见系统记录、释放或恢复会话 cursor，**不依赖 stale running 的时长阈值**。系统 MUST NOT 在进程重启后让这类运行继续显示为运行中（对话流假活或侧边栏闪烁点），也 MUST NOT 仅依赖 2 小时 stale running repair 才兜住它。判定 MUST 幂等：已是 stuck、failed 或 interrupted 的记录不重复写系统记录；正在被当前进程持有 activeRun 的运行 MUST NOT 被判为孤儿。

### Scenario: 重启后遗留的 running 被识别为卡住
- GIVEN 上一进程留下一条 SQLite 标记 running 的本地消息
- AND 新进程启动后内存中没有该 run 的 activeRun
- WHEN 启动 catch-up 执行
- THEN 该消息被落成卡住状态、追加带原因的可见系统记录、会话 cursor 被释放
- AND 界面显示「一步卡住了」与重试入口，activeRun 为空且不显示假活或空白运行态
- AND 该卡住记录在渲染刷新与桌面窗口重启后仍在

### Scenario: 正常运行不被误判为孤儿
- GIVEN 当前进程正在正常执行一条本地 run 且持有其 activeRun
- WHEN 启动 catch-up 或状态刷新执行
- THEN 该 run 保持运行中、侧边栏正常显示运行点、不被落成卡住

### Scenario: 孤儿清算幂等
- GIVEN 一条本地消息已被落成 stuck、failed 或 interrupted
- WHEN 启动 catch-up 再次执行孤儿清算
- THEN 不重复写系统记录、不改变其既有终态
