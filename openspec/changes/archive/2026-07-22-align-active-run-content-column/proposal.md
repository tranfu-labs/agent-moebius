# 提案：align-active-run-content-column

> 实现与验收已于 2026-07-22 完成。

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md#页面结构`。采访确认主时间线里的运行中临时记录应与标题、历史消息共用同一正文列；原 PRD 只明确标题与消息行文字对齐，没有把运行态的左右边界写成可验收规则，本 change 在落盘时补齐该缺口。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 页面结构 · 团队推进中 | 明确运行中角色名、实时 Markdown 与标题/历史消息使用同一左边界，运行操作使用同一右边界 | 已写入（本 change 落盘） |

## 背景

主时间线容器宽 760px。历史 `TimelineEntry` 使用 40px 左缩进，会话标题也已按同一缩进对齐；活动 `RunBlock` 却作为消息列表外的兄弟节点渲染，只带顶部间距，并保留通用组件的 680px 最大宽度。因此运行中的角色名和实时输出比标题、历史消息向左偏 40 CSS px，按钮右边界也没有贴住正文列。高分屏截图里该偏差表现为约 80 设备像素。

现有测试只证明实时内容与「停下」可见，没有覆盖运行块相对时间线正文列的几何契约，所以该回归没有被拦住。

## 提案

只在主会话时间线的活动运行宿主上复用历史消息的 40px 左缩进，并让 `RunBlock` 填满缩进后的正文列。通用 `RunBlock` 的默认最大宽度保持不变，避免改变 Storybook、子会话面板或其他宿主的布局。

新增宿主级组件回归测试，并通过真实 Electron/CDP 读取边界做视觉验收：标题、历史消息、运行中角色名和实时 Markdown 左边界一致，「停下」右边界与正文列一致。

## 影响

受影响模块：

- `packages/console-ui/src/console/operator-console.tsx`：主时间线活动运行宿主的缩进与宽度约束。
- `packages/console-ui/src/console/operator-console.test.tsx`：主时间线运行态布局契约。
- `docs/product/pages/main-conversation.md`：运行态对齐的产品事实。

保持不变：

- `RunBlock` 的通用默认布局、运行语义、实时 Markdown 更新和中断行为。
- 子会话面板及组件独立 Story 的宽度策略。
- `main-conversation-evidence-outlets` 规划中的「完整输出」操作；该 change 后续增加按钮时仍复用同一正文列。

## 验收语句

1. 主时间线存在历史消息和活动运行时，会话标题、历史消息正文、运行中角色名与实时 Markdown 使用同一左边界。
2. 「停下」贴住同一正文列的右边界，活动块不再沿用向左偏移且缩窄的 680px 布局。
3. 窄窗口下活动块仍随正文列收缩，不产生页面级横向滚动；通用 `RunBlock` 在其他宿主中的默认布局不变。
