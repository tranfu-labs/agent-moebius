# 提案：main-sidebar-implementation

## 背景

`docs/product/pages/main-sidebar.md` 已作为主页面侧边栏的事实源；同一文档末尾的「现状参考与产品缺口」列出了当前 `packages/console-ui/src/console/conversation-sidebar.tsx` 与 `desktop/src/console-page/` 距离该文档的 8 大缺口（关闭/恢复、应用级入口、标准设置、折叠+聚合、项目管理、状态/加载/失败态、红蓝闪状态点、归档）。

代码核实进一步发现两处**行为冲突**需要拆除，而不仅是"缺少"：

1. `sortConversationSessions` 按 `waiting > running > idle > completed` 状态排序；main-sidebar.md 明确规定"对话只按创建时间倒序排列……状态变化不得改变对话顺序"。
2. `openCompleted` 分组和"已完成折叠"UI；main-sidebar.md 明确废弃"已完成"状态与自动分组，改为红/蓝/闪烁点 + 用户主动归档。

会话状态枚举本身（`waiting | running | idle | completed`）也需要替换成 red/blue/blink/none 四态模型。

## 提案

本 change 覆盖 14 条实施任务（见 `tasks.md`），把上述缺口和冲突逐条填齐、拆除。任务按依赖顺序组织，允许并行执行的分支通过外部 loop 调度器（不入本仓库）在多 git worktree 上并行推进；本 change 不引入 loop 调度器代码。

产品行为的**唯一事实源**保持为 `docs/product/pages/main-sidebar.md`；本次 change 的 spec-delta 只登记那些足以让机器判定"是否符合"的行为规则和 Requirement 修改。

## 影响

受影响模块：

- `packages/console-ui/src/console/conversation-sidebar.tsx`：大改。拆除状态排序、拆除已完成折叠、替换状态模型、新增关闭/展开折叠/拖动排序/菜单/扳手修复/归档等能力。
- `packages/console-ui/src/console/conversation-sidebar.test.tsx`、`conversation-sidebar.stories.tsx`：跟随重写。
- `packages/console-ui/src/console/operator-console.tsx`：侧栏骨架、应用级入口、底部设置入口、宽度拖动、窄窗自动关闭。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`：新的 IPC/HTTP 联动（重命名项目、显示在文件管理器、移除、扳手修复、归档）。
- `desktop/src/preload.ts`、`desktop/src/main.ts`：新增 IPC（在文件管理器中显示、选择新目录）。
- `src/local-console/`：数据层新增"未读结果"标记、"需要人工处理"标记、归档字段与运行中拒绝归档校验。
- `packages/console-ui/DESIGN.md` 与相关设计说明：记录状态点视觉与折叠聚合规则。

对外行为：

- 侧边栏视觉与交互全面对齐 `docs/product/pages/main-sidebar.md` 的 17 条验收；已完成折叠分组消失，改由用户主动归档。
- 会话不再随状态跳序；红/蓝/闪烁点表达需要人工处理、未读结果与运行中。
- 项目支持手动排序、重命名、移除、目录不可用修复；对话支持归档。

GitHub runner、`agents/*.md` guardrail、Codex driver、goal-ledger 均不受影响。
