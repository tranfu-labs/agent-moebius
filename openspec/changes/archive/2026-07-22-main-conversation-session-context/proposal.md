# 提案：main-conversation-session-context

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md`。本次为**实现缺口**——PRD 已写清楚，实现没做到，因此不改 PRD 内容。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 区域与信息 · 上下文 / 操作与反馈 · 选择工作空间与团队 / 弹层与危险操作 | 无内容变更；本 change 兑现既有条文 | 已写入 |

PRD「待讨论」中与本片相邻的一项——**用户看不见 Agent 动了什么、也拿不回来**（独立工作空间的成果没有带回项目的出口、首次使用时默认值恰好是最不可逆的那个且没有提醒）——本版明确不作答。本片只兑现「界面必须把独立工作空间基于哪个提交、不含什么说清楚」这条已确认的条文，MUST NOT 自行发明成果回流入口或默认值提醒策略。

## 背景

PRD 定义输入框上方按固定顺序显示四项上下文：项目、工作空间、分支、团队。其中三项当前不成立：

1. **工作空间是项目级设置**。`worktree_mode`、`workspace_mode` 等列落在 `projects` 表上，`sessions` 表没有任何 workspace 列；`resolveWorkspace` 通过 session 找到 project 行再取值。后果是同一项目下切换一次波及全部对话。PRD 要求它是**这段对话**的设置——「同一个项目下，一段对话可以直接改文件，另一段对话可以隔离改动，互不影响」。
2. **分支显示的是字面词**。UI 渲染 `project.worktreeMode ? "会话分支" : "当前分支"`，完全没有分支名数据入参。真实分支名其实已经被读出来了（`workspace-source.ts` 的 `readCurrentBranch` 跑 `git branch --show-current`），但只进了 run 快照，没有上行到 state。PRD 要求显示真实名称——「用户要凭它在自己的编辑器或命令行里找到团队正在改的地方」。
3. **团队按钮是死的**。它是一个 `<button>`，但没有 onClick、没有下拉，只显示名字和「需要修复」徽标；server 也没有「改会话团队」接口。PRD 要求团队可以在对话进行中改变，且按钮必须让用户看出这段对话用的是**创建时载入的那一份**——「否则用户会反复修改文件并困惑于行为为何不变」。

此外，PRD 要求工作空间和团队的改变在有成员正在工作时「当前这一步跑完再生效，不中止它、不留下半截改动」，且「生效后不重放已经完成的步骤」。当前没有任何待生效机制。

## 提案

把上下文四项从「三项说假话、一项能改」补齐成「四项都说真话、三项能改」。

1. `sessions` 表新增 `workspace_mode` 与 `workspace_pending_mode`；迁移时每段会话的初值取其所属 project 当时的 `worktree_mode`，行为不变。
2. 新增 `src/local-console/workspace-resolution.ts` 承载纯判定：这段会话当前/待生效的工作空间如何呈现、项目文件夹不是 git 仓库时独立工作空间是否可选。`runtime.resolveWorkspace` 改为读会话级值，待生效落定由统一的 run 收尾事务负责。
3. `readCurrentBranch` 的结果上行到 state 序列化，并加缓存避免每次 state 请求都 spawn git。
4. 新增 `PATCH /api/local-console/sessions/:id/workspace` 与 `PATCH /api/local-console/sessions/:id/team`。两者共用同一套待生效语义：该会话没有 run 在跑时立即生效；有 run 在跑时写入待生效值，由 run 收尾钩子落定。团队创建或改选时同时把当下成员 `AGENT.md` 内容存成会话快照，后续推进不再重读团队页当前文件；运行中改选的快照与团队绑定一起待生效。
5. 从 `operator-console.tsx` 抽出 `composer-context.tsx` 承载四项上下文条，新增 `session-team-menu.tsx` 承载团队下拉与「用的是创建时载入的那份」说明。

## 影响

受影响模块：

- `src/sqlite-state-worker.ts`：`sessions` 加工作空间/待生效团队列与迁移，保存并随绑定落定会话团队内容快照。
- `src/sqlite-state.ts`、`src/local-console/types.ts`、`store.ts`：补齐会话上下文、快照和 SQLite command/store 契约。
- `src/local-console/workspace-resolution.ts`：新增。
- `src/local-console/runtime.ts`：`resolveWorkspace` 改读会话级；新增 run 收尾时落定待生效切换；state 序列化带 `branchName`。
- `src/local-console/workspace-source.ts`：分支名上行 + 缓存。
- `src/local-console/server.ts`：新增两个 PATCH 接口。
- `packages/console-ui/src/console/composer-context.tsx`、`session-team-menu.tsx`：新增，含共置测试与 Story。
- `packages/console-ui/src/console/operator-console.tsx`、共置 Story/test 与 `src/index.ts`：`ComposerContext` 与 `SessionAgentTeamButton` 迁出并导出新组件。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`：两个新 action；对应 state-sync 测试从桌面 action 入口验证接线。
- `desktop/src/main.ts`、`team-runtime-binding.ts` 与对应测试：从当前团队文件读取一次内容快照并接入 local console，团队健康仍按当前磁盘状态实时判定。
- `tests/local-console.test.ts`、`local-console-workspace-*.test.ts`、`local-console-pending-switch.test.ts`、`desktop/tests/team-runtime-binding.test.ts`：补齐共享类型调用点、迁移/纯函数和跨 server/桌面边界验收。
- `openspec/changes/main-conversation-session-context/{proposal.md,design.md,tasks.md,spec-delta/**/spec.md}`：记录符合度回补后的完整影响范围、设计、任务状态和验收 #5/#6/#7/#8/#9/#20 的可判定行为。

对外行为：

- 工作空间成为每段对话各自的设置；同一项目下的两段对话可以分别使用两种工作空间。
- 分支格显示真实分支名。
- 团队可在对话进行中改选，历史保留，由新团队接管之后的推进。
- 工作空间与团队的切换在有成员工作时延后到当前这一步结束再生效。

不受影响：GitHub runner、goal-ledger、Codex driver、项目级的其余设置（项目路径、排序、归档）。

## 验收语句

对应 `docs/product/pages/main-conversation.md`「验收标准」#5（工作空间与团队可变部分）#6 #7 #8 #9 #20：

1. 工作空间和团队在对话进行中仍可改变。
2. 改变工作空间或团队时，正在工作的成员跑完当前这一步再生效，不产生半截改动。
3. 同一个项目下的两段对话可以分别使用默认工作空间和独立工作空间，互不影响。
4. 项目文件夹不是 git 仓库时，「独立工作空间」不可选并说明原因。
5. 分支显示真实分支名称，用户可以据此在自己的编辑器或命令行中定位。
6. 团队按钮能让用户看出这段对话使用的是创建时载入的团队内容，之后在团队页的修改不影响它。
