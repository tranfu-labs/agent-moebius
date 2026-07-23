# 设计：right-sidebar-subtask-tab

## 本 change 负责的验收落点

| 验收 | 落点 | 现状 |
| --- | --- | --- |
| #21 全区只读、子任务标签例外（提供与主对话区一致的输入与推进） | `subtask-tab.tsx` 内嵌 composer + `onRetry`/`onStop`/`interrupt`；改动 / 项目文件 / 过程三类保持只读（由各自 change 承接） | 子会话数据 / 卡片已有，标签内推进新建 |

（子任务标签的其余行为主要落在 PRD「区域与信息 · 子任务标签」「操作与反馈 · 关闭标签」「弹层与危险操作」，验收编号里由 #21 统一承接右侧栏的「只读 + 子任务例外」判据。）

## 本 change 承接的规则句

- **R28「显示子任务名 / 成员 / 状态 + 推进内容」**：复用 `child-session-summary.ts`（title / memberName / status / statusLabel）+ `OperatorSubSessionView`。
- **R29「打开后主对话区对应子会话卡片行标记正在查看」**：接 `sub-session-card.tsx` 的 `openedSessionId` 高亮、`operator-console.tsx` 的 `openedSubSessionId`。
- **R30「说话方式与主对话区一致：输入框、`@` 提及、可中断成员」**：复用主对话区 composer（`role-composer.tsx` / `agent-markdown-mention-editor.tsx` / `composer-context.tsx`），当前 `sub-session-panel.tsx` 只读、无输入框，本片补。
- **R31「推进操作（重试、停下）标签内直接可用；这是本页唯一提供推进操作的地方」**：接 `onRetry`/`onStop`/`interrupt`；**守卫**：其余三类标签（改动 / 项目文件 / 过程）不得出现同款推进按钮。
- **R32「子任务标签不提供改动视图」**：标签内不渲染文件树 / 行级对比。
- **R38「关子任务标签不取消该子任务，且让用户看得出来」**：`onClose` 保持纯关闭语义，不触 `interrupt` / 删除。
- **R53「不承载子会话管理：不在右侧栏新建 / 重命名 / 删除子任务」**：子任务标签只看 + 推进对话，无管理动作（对照 `sub-session-card.tsx` 现仅 `onOpen`）。
- **R1/R45（只读 + 唯一例外）**：子任务标签改变的是那段子对话的推进，**仍不改变任何文件**；这是右侧栏对「全区只读」的唯一破例，本片要让这个例外的边界清楚（推进对话 ≠ 改文件）。

## 方案

关键决策：

1. **子任务标签是 `SubSessionPanel` 的升级，不是新起炉灶**。数据链路（`openSubSession` → `/view` → `OperatorSubSessionView`）与卡片高亮已通，本片把「单只读面板」升级为「右侧栏里的一个可推进标签」：加内嵌 composer + 推进操作 + 多标签共存。
2. **composer 直接复用主对话区那套，不另造**。PRD 强调子任务是「小一号的对话，不该另学一套规矩」——用同一套 `role-composer` / mention editor / composer-context，只把目标会话从主会话切到该子会话。
3. **推进操作接现有能力、但要接对子会话**。`onRetry`/`onStop`/`interrupt` 现服务主会话；子任务标签的推进必须作用在**对应子会话**上。接线测试从最外层入口驱动，验证打到的是子会话而非主会话（这类接线错误是跨边界任务最常见的失败）。
4. **只读例外的边界写清**：子任务标签允许输入 / 提及 / 重试 / 停下，但这些改变的是子对话推进，**不改文件**；不提供改动视图、不提供任何文件写 / git 动作。

## 权衡

- **升级 `sub-session-panel.tsx` vs 全新组件**：升级复用现成数据链路与卡片高亮，成本低；代价是要小心它同时是 evidence-outlets 的证据降级壳（已被 shell 替换），退役 / 演进时不能留悬空引用。
- **多子任务标签共存**：PRD 允许同时开多个子任务标签，各自独立推进。状态按 sessionId 隔离，composer 目标随标签切换。

## 风险

- **接线打到主会话而非子会话**：最大风险。缓解：推进入口显式带子会话 sessionId，接线测试从应用容器 / IPC 层驱动验证目标正确。
- **`operator-console.tsx` 内容分派缝**：本片替换 shell 的子任务占位槽，只改自己的内容组件，不动容器结构。
- **`sub-session-panel.tsx` 的双重身份**：它既是子会话面板又曾是证据降级壳。shell 已替换降级壳用途；本片处理它作为子任务内容时，确认没有别处仍依赖它的旧证据用途（callsite_sweep）。
