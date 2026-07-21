# 提案：main-conversation-subsession-cards

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md` 与 `docs/product/pages/main-sidebar.md`。本次**大部分是实现缺口，但「子会话是否进侧边栏」是产品意图变更**——两份页面 PRD 对此的规定互相冲突。采访中已裁决子会话不进侧边栏，PRD 已于落盘时改写。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 页面结构 · 子会话卡片 / 区域与信息 · 子会话卡片 / 响应式与窗口行为 | 无内容变更；本 change 兑现既有条文 | 已写入 |
| `docs/product/pages/main-sidebar.md` | 区域与信息 · 对话行 | 由「子对话与普通对话平铺为同级条目、以『来自：<父对话名称>』标明来源」改为「侧边栏只列用户自己发起的对话」；补记旧决策为何被推翻 | 已写入 |
| `docs/product/pages/main-sidebar.md` | 指标与验收 第 8 条 | 跟随改写 | 已写入 |

**旧决策为何被推翻**（记录在 `main-sidebar.md` 正文，此处只留指针）：子任务是团队的内部产物，不是用户主动管理的对象，而侧边栏是用户管理自己工作的地方；让它们进入侧边栏会使侧栏长度随团队的拆分行为膨胀，用户拆得越细、侧栏越不可用。代价是不能从侧边栏直接跳到某个子任务，必须先回父对话——被接受，因为子任务本来就只在父对话的语境里有意义。

PRD 明确「右侧展开区的内容、输入方式和操作由该区域的独立需求定义，本页只负责卡片何时出现、显示什么、如何打开与关闭」。本 change 因此**只交付外壳**：打开、关闭、滚动位置恢复、窄窗覆盖；展开区内部先接现有会话视图，MUST NOT 顺手为它发明输入方式或操作集。该区域的独立需求尚未建立，属 PRD 缺口，补齐落点为 `docs/product/pages/` 下的新页面 PRD，由后续需求进场时承接。

## 背景

PRD 要求团队把目标拆成多个子任务时，时间线中出现一张卡片，逐行列出子任务、负责成员和**该子任务当前的状态**；点击卡片行在右侧展开该子会话，父会话留在视野中；子会话不出现在侧边栏。

当前实现的数据层已经完备（`sessions.parent_session_id`、`session_edges` 表、子会话创建接口、CEO 子会话编排），但界面形态与 PRD 相反，且其中一条是**行为冲突**：

1. **子会话在侧边栏平铺**。`toSidebarProject` 把所有会话（含子会话）平铺进项目下的同级列表，只用一行小字标出父会话标题。这不是遗漏——`console-ui/spec.md` 的 `Flat session rail with persisted lineage` 明确要求「MUST keep parent and child sessions flat at the same indentation within their project」。PRD 要求相反：子会话不进侧边栏，因为「子任务是团队的内部产物，不是用户主动管理的对象；让它们进入侧边栏会使侧栏长度随团队的拆分行为膨胀」。
2. **卡片与右侧展开区完全不存在**。`packages/console-ui/src/console/` 下没有任何子会话卡片组件；`session-context-header.tsx` 有一个带「返回父会话」的半成品，但没有被主控制台引用。
3. **没有按父会话聚合子任务状态的接口**。子任务状态的原料散在编排描述与各子会话的状态里，服务端没有聚合读接口。而卡片必须带状态：PRD 特意说明「能被对话内容本身表达的不给状态标记」这条规则**不适用于子会话**——子会话的内容不在主时间线上，主时间线表达不了它，卡片是唯一的聚合入口，不给状态用户就只能挨个点开才知道跑完几个、有没有一个挂了。
4. **窄窗行为未定义**。上下文按钮不逐项收敛，右侧展开区不存在因而也没有窄窗覆盖。

## 提案

把子会话从侧边栏搬到主时间线的卡片上，并补齐右侧展开区外壳与窄窗行为。

1. 新增 `packages/console-ui/src/console/sub-session-card.tsx`：逐行列出子任务、负责成员、当前状态，整行可点。
2. 新增 `packages/console-ui/src/console/sub-session-panel.tsx`：右侧展开区外壳，负责打开、关闭、关闭后恢复父会话滚动位置、窄窗下覆盖整个主内容区。内部先接现有会话视图。
3. `operator-console.tsx` 主内容区改为可分栏；`toSidebarProject` 不再把子会话平铺进侧边栏，`conversation-sidebar.tsx` 移除 lineage 一行小字。
4. 新增 `src/local-console/child-session-summary.ts` 与对应读接口，按父会话聚合子任务的标题、负责成员与当前状态。
5. `runtime` 在编排产生子会话时于父时间线插入卡片锚点，使卡片有确定的时间位置而不是浮在时间线之外。
6. `composer-context.tsx`（B 片交付）补齐窄窗逐项收敛：分支 → 工作空间 → 团队 → 项目。

## 影响

受影响模块：

- `packages/console-ui/src/console/sub-session-card.tsx`、`sub-session-panel.tsx`：新增，含共置测试与 Story。
- `packages/console-ui/src/console/operator-console.tsx`：主区分栏布局；子会话不再进侧边栏数据。
- `packages/console-ui/src/console/conversation-sidebar.tsx`：移除 lineage 呈现。
- `packages/console-ui/src/console/composer-context.tsx`：窄窗收敛顺序。
- `src/local-console/child-session-summary.ts`：新增。
- `src/local-console/server.ts`：新增按父会话聚合子任务状态的读接口。
- `src/local-console/runtime.ts`：编排时在父时间线插入卡片锚点。

对外行为：

- 子会话不再出现在侧边栏；侧栏长度不随团队的拆分行为膨胀。
- 团队拆出子任务时，主时间线出现带状态的卡片；点击行在右侧展开，父会话仍可见，关闭后回到原滚动位置。
- 窄窗时右侧展开覆盖整个主内容区，上下文按钮逐项收敛。

不受影响：子会话的创建与编排链路本身、`session_edges` 的持久化语义、`parent_session_id` 服务运行时编排与恢复的既有用途。

## 验收语句

对应 `docs/product/pages/main-conversation.md`「验收标准」#15 #21：

1. 团队拆出子任务时时间线出现卡片，每行显示子任务、负责成员和当前状态；子会话不出现在侧边栏；点击卡片行在右侧展开，父会话仍可见，关闭后回到原滚动位置。
2. 窗口变窄时上下文按钮逐项收敛，项目和团队最后收敛；右侧展开的子会话覆盖整个主内容区。
