# 设计：composer-run-input-unification

## 本 change 负责的验收落点

| 验收 | 落点（持久化字段 / 进程边界 / 模块） | 现状 |
| --- | --- | --- |
| mc-39 | composer keydown 的输入法组合判定 | main 上待确认；工作区 `role-composer.tsx:274` 已含 `isComposing`（附件 change 未合入 main，需以点火时 main 为准，若已合入则记「已合规」跳过） |
| mc-40 | 运行中禁用判定 `operator-console.tsx:942`（`disabled={activeRun !== null || ...}`）+ composer 按钮双态 + 运行中发送路由 | 运行中整体禁用；composer 无停下态 |
| mc-11（修订） | `run-block.tsx:68-79` 的「停下」按钮 | 操作条上仍有「停下」 |

## 规则句绑定（拆分时全库扫描的落点，reflect 段以此核对）

- **「停下入口在整个产品中只有这一处；运行记录末尾不再出现停下」**——现有停下入口全集：
  - `packages/console-ui/src/console/run-block.tsx:68-79` 操作条「停下」按钮（要移除的那个）。
  - `packages/console-ui/src/console/operator-console.tsx:887-893` 与 `:1009-1015` 两处 `<RunBlock ... onInterrupt={...}>` 渲染点（接线要迁走）。
  - 后端唯一停止链路：`desktop/src/console-page/app.tsx:1337-1349` `interrupt()` → `POST /api/local-console/sessions/:id/interrupt`（`src/local-console/server.ts:551-565`）→ `src/local-console/runtime.ts:527-534` `interruptRun`。**只有一条，不需收敛，保持不动**。
  - `runner-supervisor.ts` 的 `stop()` 是停 local-console 服务进程，与「停下 run」不是同一概念，非落点。
- **「Enter 组合保护」**——全库唯一 keydown 提交判定在 `packages/console-ui/src/console/role-composer.tsx:274`；会话页（`operator-console.tsx:933-940`）与新对话页（`new-conversation-page.tsx:111`）共用 RoleComposer，无第二份实现。团队编辑器 `agent-markdown-mention-editor.tsx` 无「发送」动作，经用户裁决**豁免**。
- **「运行中发送不打断」**——提交入口 `operator-console.tsx:940` `submitComposer`；送达路由属后端既有「说话与提及」规则（route-bus / store 路由记录），本 change 需验证运行中 POST 消息不触发中断，行为缺失才补，不重设计路由。
- 行号以拆分时工作区为准，实施时以最新 main 重新定位。

## 方案

1. RoleComposer 增加 `runActive`（或等价）状态：`runActive && 输入为空` → 按钮渲染停下（⏹，aria 标签「停下当前这一步」），点击触发 `onInterrupt`；有字 → 按钮渲染发送（↑）。`disabled` 不再由 `activeRun` 驱动，仅保留发送中/不可继续状态等既有禁用原因。
2. keydown 判定保持单一实现：Enter 且非 Shift 且非 `isComposing` 且可提交才发送（若 main 已含该判定则确认加测试即可）。
3. run-block 删除停下按钮与 `onInterrupt` prop，两处渲染点同步清理；interrupt 回调改接进 composer。
4. 运行中发送：走既有 `submitComposer` → POST messages 链路；用最外层入口（应用容器/IPC 层）验证「运行中发消息 → 当前 run 不中断、消息按路由送达」。
5. 团队切换等待态（PRD 版式中显示 ⏹ 的另一处）与空输入停下态复用同一按钮逻辑。

## 权衡

- 停下按钮随输入内容瞬时切换为发送：损失「打字中途立即停下」的能力，PRD 已明示这是按钮合一的明知代价（清空后按停下，文字不保留），不为此加第二入口。
- 不做发送队列/排程：PRD 已销掉「排队到这一步结束再送达」的待讨论项，运行中发送即时送达主 Agent。

## 风险

- 解除整体禁用后暴露的并发路径（发送时 run 恰好结束、停下时消息恰在途）：以后端事实为准渲染，竞态用现有状态同步机制兜底，测试覆盖「按下停下瞬间 run 已完成」不产生误报。
- 与 `stop-edit-resend` 的接壤：本 change 不实现回填，只保证「你让这一步停下了」系统记录照旧产生（`recordInterrupted` 链路不动）。
