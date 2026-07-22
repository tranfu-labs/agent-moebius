# 提案：stop-edit-resend

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/main-conversation.md | 停下 · 验收 #41 | 停下后「改一改重发」：系统记录旁入口、回填本轮起点用户消息、重发是新消息 | 已写入 |
| docs/product/pages/main-conversation.md | 页面状态一览「已停下」行 | 记录旁提供「改一改重发」入口 | 已写入 |

## 背景

误发送的兜底路径缺失：停下后用户只能手动重新打一遍原话。PRD 裁决：「你让这一步停下了」的系统记录旁提供「改一改重发」，把本轮起点——用户最近发出的那条消息——的正文回填到输入框（附件保持为该消息的托管副本引用），修改后重新发送。回填不撤销文件改动、不修改或删除原消息；重发是新消息、开启新的一轮。产品不提供历史消息原地编辑或分叉重跑。

## 提案

- 「已停下」的系统记录（user-stopped）旁增加「改一改重发」操作。
- 触发后把引发该步的用户消息（本轮起点）正文回填到输入框；有附件时以托管副本引用形式一并回填草稿（消费 `local-console-managed-attachments` 提供的附件引用克隆能力）。
- 重发走普通发送链路，产生一条新消息；时间线原消息不被修改或删除；已产生的文件改动不回滚。
- 不提供历史消息的原地编辑或从历史消息分叉重跑的任何入口。

## 影响

受影响模块：

- `packages/console-ui/src/console/run-outcome.tsx` —— user-stopped 分支增加「改一改重发」按钮（现状该分支无任何操作按钮）。
- `packages/console-ui/src/console/operator-console.tsx` / `desktop/src/console-page/` —— 定位本轮起点用户消息、正文回填 composer 草稿、附件引用克隆调用与草稿状态同步。
- `src/local-console/`（如需）—— 若「本轮起点用户消息」无现成可查接口则补最小查询；附件克隆使用既有 `cloneMessageAttachmentsToDraft` 能力，不自建。

对外行为：已停下状态多一个「改一改重发」入口；触发后输入框出现原正文（与附件草稿引用），用户可修改后发送。

保持不变：user-stopped 系统记录的产生链路与中性表述；停下不触发红点；发送链路（重发即普通发送）；附件存储模型（只调用克隆能力，不动 attachment 表结构）；无历史消息编辑/分叉入口。

外部前提：附件引用回填依赖 `local-console-managed-attachments` 落地后的克隆能力；点火时该能力尚未在 main 上时，本 change 先交付正文回填，附件回填在 design 中标注为待该能力就位后的接续项，并在 .task-done 的 known_issues 里如实记录。
