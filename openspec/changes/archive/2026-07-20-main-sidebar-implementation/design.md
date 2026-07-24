# 设计：main-sidebar-implementation

## 方案

本 change 是"实施型"而非"探索型"，产品事实源已经在 `docs/product/pages/main-sidebar.md` 落定。设计工作集中在**执行编排**与**几个关键决策**。

### 执行编排

14 条任务在一个 openspec change 内组织，通过项目外的多 worktree loop 调度器并行推进。调度器本身不进本仓库；tasks 定义、验收与 spec-delta 进本仓库。产品调试壳（web-shell）进本仓库、跟随 `console-ui` 演进；loop 运行时状态、codex 会话文件、每 worktree 状态目录都在仓库外。

### 关键决策一：状态模型从 4 档换成 4 态点

现状 `ConversationSessionStatus = "waiting" | "running" | "idle" | "completed"` 与 main-sidebar.md 定义的红/蓝/闪烁/无点是**不同的语义空间**：

- 前者是"会话生命周期"，一个会话同时最多在一档。
- 后者是"用户需要感知的最紧迫事项"，其中"未读结果"（蓝点）依赖用户是否查看，"需要处理"（红点）依赖任务是否阻塞在人工动作。

替换而不是映射：新的四态由三个正交事实推导——`needsHuman: boolean`（阻塞在人）、`hasUnreadResult: boolean`（本轮结束但用户未查看）、`isRunning: boolean`。派生规则由 `deriveStatusDot` 集中；同一时刻只显示一个点，优先级红 > 蓝 > 闪烁。

数据层新增字段落在 `session_messages` 或 session 表：`unread_since` 时间戳（agent 回复插入时设置，用户打开会话时清除）、`awaits_human_reason` 枚举（等待回答/等待确认/等待验收/异常）。

### 关键决策二：拆除已完成折叠，改由用户归档

`openCompleted` 分组会被完全移除。原属于"已完成"的会话，如果用户不主动归档，将继续以"无点"状态留在侧栏顶部（按创建时间倒序）。归档是显式动作，进 `archive` 字段，从侧栏消失但记录保留。

### 关键决策三：对话按创建时间倒序、状态不再影响顺序

`sortConversationSessions` 的整体删除。侧栏只用 `ORDER BY created_at DESC`；任何状态变化（收到新结果、切换选中、开始运行）都只更新该行的表现，不改顺序。

这条隐含一个数据面变化：现有 `session_messages` 没有 session 级 `created_at`（session 的创建时间可能来自第一条消息），需要 session 表本身有稳定 `created_at`，或从最早消息 id 推导。T3 任务落实这个 detail。

### 关键决策四：项目行既是拖动载体、也是点击展开触发

Main-sidebar.md 明确规定不再有独立拖动把手；点击展开与拖动排序共用项目行，通过拖动阈值区分。行内的 `＋` 和 `⋯` 是独立按钮，事件不冒泡到行；扳手修复按钮独立、不进"更多"菜单。

### 关键决策五：目录不可用修复只更新记录

扳手修复的语义是"应用外文件夹被移动/重命名后，指出新位置"，moebius 只更新记录、绝不移动或复制文件。已被其他活动项目绑定的目录禁止重复绑定；已移除项目释放绑定后可被新项目使用。

## 权衡

- **多任务并行 vs. 单线程可预测**：选并行。UI 手验在 web-shell 里做，多 worktree 各占一端口不打架；主 loop 只做无冲突 rebase，冲突打回 codex 自解。代价是初期 loop 调度器需要写一次。
- **状态模型替换 vs. 增量兼容**：选替换。旧四档与新四态语义不同，做映射会长期背包袱。代价是相关测试要重写。
- **归档字段落 session 层 vs. 落 project 层**：选 session 层。项目移除时批量把该项目下的 session 全部标 archived，语义清晰。
- **拖动排序用 dnd-kit vs. 原生 HTML5 DnD**：延迟到 T9 实现时决定。首选 dnd-kit（无障碍更好、事件更可控），如果与现有 Radix 组件事件冲突严重再换。

## 风险

- **主内容区打开按钮独立于侧栏**：`operator-console.tsx` 现在把 `PanelLeft` 图标作为纯装饰放在主区右上角；T4 要把它改成真按钮并处理"侧栏隐藏时主内容区扩宽"的布局重排。若布局重排触发已存在时间线组件的意外重挂载，会打断正在运行的 codex 输出显示——需要在 T4 增加"侧栏折叠不重挂主区"的回归测试。
- **拖动排序 vs. 项目展开触发**：拖动阈值太小会误触展开，太大会让排序感觉迟滞。首版按 5px + 150ms 组合阈值，T9 结合真实体验再调。
- **web-shell 无法完全代替 electron 手验**：`selectProjectFolder` 原生对话框、macOS 交通灯、窗口宽度自动关闭、系统菜单等属 electron 独占。相关验收（#1 中 macOS 部分、#14、#16 宽度部分）合并到 main 后需要在真实 electron 兜底验一次。
- **归档语义与 T4.5 handoff loop 交互**：T4.5 已引入 session 级消息处理位点。归档 session 是否应停止其位点前进需在 T11 明确；建议归档立刻清 active_run 并停止 drain，恢复归档时按位点续跑。
