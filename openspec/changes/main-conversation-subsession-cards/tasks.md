# 任务：main-conversation-subsession-cards

任务编号 `T\d+` 是 loop 调度器识别 id 的固定契约。`覆盖验收 #N` 指 `docs/product/pages/main-conversation.md`「验收标准」的编号。

前置：`main-conversation-session-context` 已归档（T7 窄窗收敛落在它交付的 `composer-context.tsx` 上）、`main-conversation-timeline-truth` 已归档（子任务状态取值与四种事实对齐）。

- [ ] T1: 子任务状态聚合
  - [ ] 新增 `src/local-console/child-session-summary.ts`：按父会话聚合子任务标题、负责成员、当前状态
  - [ ] 状态取值与四种事实对齐，界面不自行推导
  - [ ] 新增 `tests/local-console-child-session-summary.test.ts`：状态聚合 / 空拆分 / 子会话链损坏时的降级 / 成员名解析
  - [ ] 覆盖验收 #15

- [ ] T2: 聚合读接口
  - [ ] `src/local-console/server.ts` 新增按父会话列出子任务及其状态的读接口
  - [ ] 覆盖验收 #15

- [ ] T3: 卡片锚点落时间线
  - [ ] `runtime` 在编排产生子会话时于父会话时间线插入卡片锚点记录
  - [ ] 卡片位置在触发拆分的那条消息之后，重启后位置稳定
  - [ ] 覆盖验收 #15

- [ ] T4: 子会话卡片组件
  - [ ] 新增 `packages/console-ui/src/console/sub-session-card.tsx`：逐行子任务 / 负责成员 / 当前状态，整行可点
  - [ ] 每行状态必须出现，不因「能被对话内容表达的不给状态标记」而省略
  - [ ] 新增共置测试与 Story
  - [ ] 覆盖验收 #15

- [ ] T5: 右侧展开区外壳
  - [ ] 新增 `packages/console-ui/src/console/sub-session-panel.tsx`：打开 / 关闭 / 父会话仍可见 / 关闭后恢复父会话滚动位置
  - [ ] 内部先接现有会话视图；MUST NOT 为展开区发明输入方式或操作集
  - [ ] 滚动位置基于父会话滚动容器记录与还原，还原后校正一次
  - [ ] 覆盖验收 #15

- [ ] T6: 子会话从侧边栏摘除
  - [ ] `operator-console.tsx` 的 `toSidebarProject` 过滤掉带父会话的会话
  - [ ] `conversation-sidebar.tsx` 移除 lineage 一行小字
  - [ ] 只摘 UI，`parent_session_id` 与 `session_edges` 的运行时用途不动
  - [ ] 相关测试用例随行为重写，不留两套语义并存
  - [ ] 覆盖验收 #15

- [ ] T7: 窄窗行为
  - [ ] `composer-context.tsx` 按 分支 → 工作空间 → 团队 → 项目 顺序逐项收敛
  - [ ] 右侧展开的子会话在窄窗下覆盖整个主内容区
  - [ ] 覆盖验收 #21

- [ ] T8: 滚动行为回归
  - [ ] 时间线是页面唯一的主要滚动区域；页面标题和输入框在分栏前后都保持可达
  - [ ] 分栏前后：有新内容且用户停留在底部时自动跟随；用户已向上翻阅时不打断，并提供回到底部的方式
  - [ ] 长文本换行不撑破布局；代码与命令输出横向滚动，不撑宽页面
  - [ ] 覆盖验收 #21

- [ ] T9: 真实桌面窗口验收
  - [ ] 造一次拆分 → 卡片出现，每行有子任务、成员、状态
  - [ ] 点行 → 右侧展开，父会话仍可见
  - [ ] 展开期间父会话有新消息进来 → 关闭后仍回到原滚动位置
  - [ ] 侧边栏无子会话
  - [ ] 拖窄窗 → 右侧展开覆盖整个主内容区；上下文按钮按 分支 → 工作空间 → 团队 → 项目 顺序收敛
  - [ ] 覆盖验收 #15 #21
