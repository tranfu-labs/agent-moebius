# 提案：composer-run-input-unification

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/main-conversation.md | 输入框 · 验收 #39 | 输入法组合中 Enter 只确认候选词不发送；Enter 发送、Shift+Enter 换行 | 已写入 |
| docs/product/pages/main-conversation.md | 输入框 · 团队推进中 · 验收 #40 | 运行中输入框保持可用；停下与发送合一为右下角同一按钮（空=停下⏹、有字=发送↑）；发送不打断 | 已写入 |
| docs/product/pages/main-conversation.md | 运行中的操作条 · 验收 #11（修订） | 操作条移除「停下」只留「完整输出」，含 2026-07-22 推翻旧决策的裁决注 | 已写入 |
| docs/product/pages/main-conversation.md | 说话与提及 | 补一句话与打断分开：不提及=交主 Agent 不打断；打断=按停下或 @ 正在工作的成员 | 已写入 |

## 背景

现状与 PRD 相悖的三处：成员工作时 composer 被 `activeRun !== null` 整体禁用；「停下」挂在运行记录操作条上（run-block）而非输入框；Enter 发送对输入法组合状态的保护在 main 上尚未确认落地。PRD 2026-07-22 裁决：停下和说话同属「用户介入正在推进的团队」一个动作面，收敛到输入框同一按钮位，操作条上再放一份「停下」是同一动作两个入口，违背时间线克制原则。

## 提案

- 输入法组合中按 Enter 只确认候选词、不发送；组合结束后 Enter 正常发送，Shift+Enter 始终换行（会话页与新对话页共用同一 composer 实现）。
- 成员正在工作时输入框保持可用：为空时右下角按钮呈现「停下」（⏹），按下中止当前这一步；输入文字后同一按钮变回「发送」（↑），Enter 同样触发发送。
- 运行中发出的消息按「说话与提及」规则送达：不提及任何人交给主 Agent、不打断正在工作的成员；`@` 正在工作的成员仍等于打断并带新指令。
- 运行记录操作条移除「停下」，只保留「完整输出」；停下入口在整个产品中只此一处（composer 按钮）。
- 清空输入框按停下时，清掉的文字不自动保留——这是按钮合一的明知代价，不新增第二个停下入口。

## 影响

受影响模块：

- `packages/console-ui/src/console/role-composer.tsx` —— 按钮双态（停下/发送）、运行中可用态、输入法组合保护、可访问性标签。
- `packages/console-ui/src/console/run-block.tsx` —— 移除「停下」按钮与 `onInterrupt`，只留「完整输出」。
- `packages/console-ui/src/console/operator-console.tsx` —— 解除 `activeRun !== null` 的整体禁用；两处 RunBlock 渲染点的 interrupt 接线迁移到 composer 按钮；运行中提交的送达路径。
- `desktop/src/console-page/app.tsx` —— interrupt 调用（POST interrupt 路由）改由 composer 停下按钮触发；运行中发送的请求链路确认。
- `src/local-console/`（如需）—— 确认运行中追加用户消息不打断当前 run 的既有路由行为，缺失则补。

对外行为：运行中输入框可编辑、可发送；停下按钮位置改变；操作条只剩「完整输出」。

保持不变：后端 interrupt 链路只有一条（server interrupt 路由 → runtime.interruptRun），不动其语义；「说话与提及」已裁决的路由规则；团队切换「跑完当前这一步再生效」的既有行为（该状态下按钮显示 ⏹，见 PRD 版式）；附件相关输入框行为（由 local-console-managed-attachments 承接）。
