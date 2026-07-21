# 提案：main-conversation-timeline-truth

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md` 与 `docs/product/pages/main-sidebar.md`。本次**大部分是实现缺口，但状态点部分是产品意图变更**——两份页面 PRD 对红点来源的定义互相冲突，且 `main-conversation.md` 原文自称「三者与侧边栏已确认的定义一一对应」这句话不成立。采访中已裁决以 `main-conversation.md` 为准，PRD 已于落盘时改写。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 区域与信息 · 时间线 / 运行中的操作条 / 操作与反馈 · 停下 / 重试 / 页面状态 · 三种不可继续状态的共同规则 | 无内容变更；本 change 兑现既有条文 | 已写入 |
| `docs/product/pages/main-conversation.md` | 操作与反馈 · 侧边栏状态点的触发 | 声明本节是红点来源的唯一定义处；红点补入三种不可继续状态；蓝点补入「用户尚未查看」并指向侧边栏的清除条件；说明红点与只读表现不互斥 | 已写入 |
| `docs/product/pages/main-sidebar.md` | 页面状态 · 对话状态点与顺序 | 红点定义由「需要用户回答、确认、验收或处理异常」改为引用会话页；补记旧决策为何被推翻；蓝点补入「最后一条未提及任何成员」；无点补入「用户按了停」 | 已写入 |
| `docs/product/pages/main-sidebar.md` | 操作与反馈 · 选择对话 / 指标与验收 | 红点清除条件与转红点条件跟随新判据；验收第 5 条补入「按停后无点」并指向会话页 | 已写入 |

**旧决策为何被推翻**（记录在 `main-sidebar.md` 正文，此处只留指针）：原定义假设 Agent 会主动声明自己需要人工裁决，而产品目前没有这样的信号源，导致红点既可能漏报也可能误报。新定义只认产品能确定判断的事实，从而保证「用户被红点带回来时页面上一定有一条说明发生了什么的记录」。

PRD「待讨论」中与本片高度相邻、本版**明确不作答**的三项，实现一律留空：

- 界面是否提供按需展开的原始错误输出。本片只给一句人话，不加展开区。
- 「一步卡住」的判据是什么，以及卡住之后是否显示已经多久没有动静。本片沿用当前实现已有的卡住判定，不重新定义，也不加静默时长展示。
- 「重试」的语义（重跑这一步还是让成员重新思考、上一次的文件改动会不会重复写入、产品自身的自动重试次数是否可见）。本片只保证按钮出现的位置与条件，不改变重试行为，也不暴露自动重试次数。

以及：**成员如何主动声明「我需要用户裁决」，以及它是否成为红点来源**，PRD 记入待讨论。本片把红点判据换成 PRD 已确认的三种异常，MUST NOT 顺手把「等人回话」保留成第四种红点来源。

## 背景

PRD 对时间线的立场是：**能被对话内容本身表达的，不给状态标记**。成员在回复、在 @ 别人，本身就说明了交棒；成员正在吐字，本身就说明了运行中。只有四种事实升格为可见状态：一步没跑起来、一步卡住了、用户按了停、反复重试仍未成功——它们全部来自机器故障或用户动作，不是团队协作的失败。

当前实现与此有四处偏离，其中一处是**行为冲突**而非缺少：

1. `run-block.tsx` 渲染「已完成 / 未开始 / 进行中」三档步骤状态标签、对应图标，以及 `elapsed` 计时。PRD 明确要求不显示计时。`badge.tsx` 另有「已显示」等六种过程态变体。`session-context-header.tsx` 还有一条「通过 / 运行中 / 等你」计数条，PRD 里没有它的位置。
2. **机器信息只挡了一半**。`forbiddenMachineTextPattern` 只作用于 run summary；agent 消息体原文、run step 标题都不过滤。数据层还在持续写入英文机器串（`Skipped local run: ...`、`Local child session orchestration completed: <sessionIds>`），目前只靠 UI 层整条替换才没露出。
3. **状态点判据不是 PRD 要的那个（行为冲突）**。现有红点来源是 `sessions.awaits_human_reason`（枚举为 answer / confirmation / acceptance / exception，语义是「agent 请求人工裁决」）；PRD 要求红点只由「没跑起来 / 卡住 / 反复重试仍未成功」触发，且**用户按下「停下」不触发红点**——「那是用户自己刚做的动作，不需要产品回头提醒他」。PRD 的蓝点判据「没有任何成员在工作，且最后一条消息没有提及任何人」在代码中完全不存在，现有 `unread_since` 没有读取最后一条消息的 mention。
4. **三种不可继续状态只做了一种**。项目文件夹不可用的检测、运行期分流与修复恢复已基本完成；「团队已删除」没有独立状态，被归进「需要修复」；团队修复完成后不会自动恢复推进能力，只能靠轮询；而 PRD 要求的「改选另一支团队即恢复」这条路径当前完全不通。

另有一条与「Agent 只来自团队」有关：`team-runtime-binding.ts` 在会话没有团队绑定时回退读取共享 `agents/` 目录，`server.ts` 的默认 `listAgentFiles` 同样指向它。PRD 与 Agent 团队页一致要求 Agent 只来自团队，没有脱离团队的全局来源。

## 提案

把时间线上的机器记账收敛成人话，把状态点换到 PRD 的判据，把三种不可继续状态补成同一套表现加各自的恢复路径。

1. 删除 `run-block.tsx` 的步骤状态标签、状态图标与计时；只保留正在做什么的实时输出与末尾的「停下」。删除 `session-context-header.tsx` 的计数条。
2. 新增 `packages/console-ui/src/console/machine-text.ts`，把机器信息过滤从 run summary 扩到所有渲染文本；runtime 侧把系统消息体改成用户语，并新增 `system_event_kind` 让界面不再靠字符串猜。
3. 新增 `packages/console-ui/src/console/status-dot.ts`，红蓝闪判据换源：红=存在未处理的「没跑起来 / 卡住 / 反复重试仍未成功」；蓝=没有成员在工作且最后一条消息未提及任何人；闪=有成员在工作。用户按下「停下」不进红。
4. 新增 `src/local-console/session-status.ts`，统一判定三种不可继续状态与各自的恢复条件，并把团队健康纳入运行期 abort 判据：已经拥有有效隔离副本、能安全完成的执行跑完当前这一步；依赖已不可用的项目文件夹或团队内容、无法安全继续的执行立即停止并留下可读记录。
5. 拆除 `team-runtime-binding.ts` 的共享 `agents/` 回退与 `server.ts` 的同名默认值；结构升级时把没有团队绑定的既有会话绑定到自带的第一支团队。

## 影响

受影响模块：

- `packages/console-ui/src/console/run-block.tsx`、`run-outcome.tsx`、`session-context-header.tsx`：过程标记与计时移除，四种事实的表现落定。
- `packages/console-ui/src/console/machine-text.ts`、`status-dot.ts`：新增，含共置测试。
- `packages/console-ui/src/console/conversation-sidebar.tsx`：`deriveStatusDot` 迁出并换源。
- `packages/console-ui/src/console/operator-console.tsx`：`systemSummary` 与 `forbiddenMachineTextPattern` 迁出。
- `packages/console-ui/src/ui/badge.tsx`：过程态变体收敛。
- `src/sqlite-state-worker.ts`：`session_messages` 加 `system_event_kind`；会话级异常标记迁移。
- `src/local-console/runtime.ts`：系统消息体改用户语并带事件类型；运行期 abort 判据纳入团队健康。
- `src/local-console/session-status.ts`：新增。
- `desktop/src/team-runtime-binding.ts`、`src/local-console/server.ts`：拆除共享 `agents/` 回退。

对外行为：

- 时间线不再出现「已交棒 / 已完成 / 运行中」这类过程标记，运行中的操作条不显示计时，这一步结束后操作条消失且历史中不留痕迹。
- 界面文案不出现运行目录、工作目录、数据库路径或内部标识。
- 侧边栏红点只由三种异常触发，正常完成的对话不产生红点，用户按下「停下」不产生红点。
- 项目文件夹不可用、团队已删除、团队需要修复使用同一种不可继续表现，各自恢复动作完成后恢复输入、发送和推进能力。
- Agent 只来自团队；没有团队绑定的既有会话在升级时绑定到自带的第一支团队。

不受影响：GitHub runner 的 intake 与响应链路、goal-ledger、Codex driver 本身的重试策略。

## 验收语句

对应 `docs/product/pages/main-conversation.md`「验收标准」#10 #11 #12 #13 #14 #16 #17 #18：

1. 时间线中不出现「已交棒」「已完成」「运行中」这类过程状态标记；时间只在悬停时显示。
2. 正在工作的成员实时展示输出，其记录末尾提供「停下」且不显示计时；这一步结束后操作条消失，历史中不留痕迹。
3. 没跑起来、卡住、已停下和反复重试仍未成功四种事实可见且彼此可区分，刷新页面或重启应用后仍然可见。
4. 界面文案不出现运行目录、工作目录、数据库路径或内部标识。
5. 用户不提及任何人时消息发给主 Agent；提及某个正在工作的成员会让它停下并带着新指令重新开始。
6. 侧边栏红点只由没跑起来、卡住、反复重试仍未成功触发；蓝点由「无人在工作且最后一条未提及任何人」触发；用户按下「停下」不触发红点。任务正常完成不产生红点。
7. 项目文件夹不可用、团队已删除、团队需要修复三种情况使用同一种不可继续表现；各自的恢复动作完成后，这段对话恢复输入、发送和推进能力。
8. 上述三种情况在有成员正在工作时发生，能安全完成的执行跑完当前一步再停止，无法继续的立即停止并留下可读记录；界面不再显示成员正在工作。
