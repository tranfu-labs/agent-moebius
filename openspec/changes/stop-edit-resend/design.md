# 设计：stop-edit-resend

## 本 change 负责的验收落点

| 验收 | 落点（持久化字段 / 进程边界 / 模块） | 现状 |
| --- | --- | --- |
| mc-41 | user-stopped 系统记录旁入口（`run-outcome.tsx`）+ 本轮起点用户消息定位 + composer 草稿回填 + 附件引用克隆 | 完全未物化；`run-outcome.tsx:68-72` 只对 run-not-started/run-stuck 渲染「重试」，user-stopped 无操作按钮 |

## 规则句绑定（拆分时全库扫描的落点，reflect 段以此核对）

- **「回填不修改或删除时间线里的原消息；重发是一条新消息」**——store 层全部为 `record*`/`append*` 追加与状态推进，无 `updateMessageBody`/`deleteMessage`；本 change 必须保持这一形态，回填只读原消息、重发走 `appendUserMessage` 既有链路。
- **「产品不提供历史消息的原地编辑或从某条历史消息分叉重跑」**——现状时间线组件无编辑/分叉入口（合规）；本 change 新增的入口只允许出现在 user-stopped 系统记录旁，不得给一般历史消息增加任何编辑/重发入口。
- **「回填不撤销已经产生的文件改动」**——`run-outcome.tsx:29` 现有副文案已声明「已经产生的文件改动会保留」；回填实现不得触碰工作空间文件。
- **user-stopped 事实来源**——`src/local-console/store.ts:386 recordInterrupted` / `src/local-console/runtime.ts:1204 recordInterruptedBestEffort`（`systemEventKind: "user-stopped"`）；「本轮起点=用户最近发出的那条消息」从会话消息事实中定位，不新增平行状态。
- **附件引用克隆**——`local-console-managed-attachments` 的 `cloneMessageAttachmentsToDraft`（其 design「与改一改重发的兼容边界」节）：同 session 合法 source user message → 目标 draft key，原 message ref 不变、不复制 blob；跨 session/非 user source/冲突/blob 缺失整体拒绝。本 change 只调用这条能力，不直接改 attachment 表。
- 行号以拆分时工作区为准，实施时以最新 main 重新定位。

## 方案

1. `run-outcome.tsx` user-stopped 分支增加「改一改重发」按钮（与「重试」同形态的次级操作），回调向上传递该停下事件对应的 sessionId/runId。
2. 本轮起点定位：由停下记录回溯该 run 的触发用户消息（消息事实中该 run 之前最近一条用户消息）；定位逻辑放在数据侧（desktop console-page 或 local-console 查询），不在渲染组件里猜。
3. 回填：正文写入 composer 草稿（走既有草稿持久化，跨切换/重启保留）；附件经克隆能力生成新的 draft refs。草稿已有内容时的覆盖策略：回填覆盖当前草稿前需用户无感知损失——若草稿非空，以覆盖并保留可撤销的最小交互处理（实施时从简，不新增确认弹层即可满足 PRD）。
4. 重发即普通发送：不携带任何「重发」标记语义，新消息开启新一轮。

## 权衡

- 入口只挂 user-stopped 记录：不给所有历史消息加「重发」，避免暗示可编辑历史/回滚文件改动。
- 附件回填依赖外部 change：接受分两步交付（先正文后附件），换取不阻塞停下/发送合一链条的推进。

## 风险

- 「本轮起点」在多成员接力/路由场景下的歧义：以「该 run 的触发消息」为准，接力中途的 run 回溯到用户最近那条消息；实施时用真实接力会话做外层入口测试。
- 克隆能力未就位：正文先行，known_issues 留痕，附件部分等能力合入后接续（调度器点火前重估会核对）。
