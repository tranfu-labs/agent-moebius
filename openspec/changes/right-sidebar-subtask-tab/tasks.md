# 任务：right-sidebar-subtask-tab

前置：`right-sidebar-shell` 已落 main（提供子任务内容标签的占位槽与分派缝）；`main-conversation-subsession-cards` 已落 main（子会话卡片 + `openSubSession` + `/view` + `child-session-summary.ts`）；主对话区 composer（`role-composer` / mention editor / composer-context）可复用。

- [x] T1: 子任务标签内容与状态
  - [x] 显示子任务名称、负责成员、当前状态（复用 `child-session-summary.ts`）+ 推进内容（`OperatorSubSessionView`）
  - [x] 多个子任务各占一个标签，状态按 sessionId 隔离
  - [x] 覆盖验收 #21（子任务标签显示侧）

- [x] T2: 内嵌 composer（与主对话区一致）
  - [x] 子任务标签内嵌主对话区同一套 composer：输入框 + `@` 提及成员 + 中断正在工作的成员
  - [x] `sub-session-panel.tsx` 从只读升级 / 演进为可推进，或由 `subtask-tab.tsx` 取代
  - [x] 覆盖验收 #21（说话方式一致）

- [x] T3: 推进操作接对应子会话
  - [x] 重试、停下接 `onRetry`/`onStop`/`interrupt`，作用在对应子会话上（非主会话）
  - [x] 守卫：改动 / 项目文件 / 过程三类标签不得出现推进按钮
  - [x] 覆盖验收 #21（唯一推进处 + 其余只读）

- [x] T4: 正在查看联动与关闭语义
  - [x] 打开子任务标签 → 主对话区对应子会话卡片行标记为正在查看（`openedSessionId` 高亮）
  - [x] 关闭子任务标签只关视图、不取消子任务，且让用户看得出来（`onClose` 纯关闭，不触 interrupt）
  - [x] 覆盖验收 #21

- [x] T5: 边界守卫
  - [x] 子任务标签不提供改动视图（不渲染文件树 / 行级对比）
  - [x] 不在右侧栏新建 / 重命名 / 删除子任务
  - [x] 除对话推进外不改任何文件、无 git 动作
  - [x] 覆盖验收 #21

- [x] T6: 真实桌面窗口验收
  - [x] 点子会话卡片某行 → 打开子任务标签，显示名 / 成员 / 状态 + 推进内容
  - [x] 打开时对应卡片行显示正在查看
  - [x] 在标签内说话 / `@` 提及 / 重试 / 停下 → 作用到对应子会话（从最外层入口验证，非灌参数）
  - [x] 关子任务标签 → 子任务不被取消，界面看得出来
  - [x] 子任务标签内没有改动视图，也没有任何改文件 / git 控件
