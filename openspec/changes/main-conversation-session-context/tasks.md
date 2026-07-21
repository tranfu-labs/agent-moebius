# 任务：main-conversation-session-context

任务编号 `T\d+` 是 loop 调度器识别 id 的固定契约。`覆盖验收 #N` 指 `docs/product/pages/main-conversation.md`「验收标准」的编号。

前置：`main-conversation-new-page` 已归档（本片的 composer 上下文条建立在新对话页交付的形态上）。

- [ ] T1: sessions 表新增工作空间列与迁移
  - [ ] `sessions` 加 `workspace_mode`、`workspace_pending_mode`
  - [ ] 迁移：每段会话 `workspace_mode` 初值取所属 project 当时的 `worktree_mode`
  - [ ] `projects` 上与目录本身有关的列保留，不删
  - [ ] 新增 `tests/local-console-workspace-migration.test.ts`：继承所属项目当时的值 / 重复执行幂等 / 项目已移除的孤儿会话
  - [ ] 覆盖验收 #7

- [ ] T2: 工作空间解析纯函数
  - [ ] 新增 `src/local-console/workspace-resolution.ts`：给定 session 行 + project 行 → 生效模式 / 待生效模式 / 独立工作空间是否可选及不可选原因
  - [ ] 不依赖 SQLite 与 git 调用
  - [ ] 新增 `tests/local-console-workspace-resolution.test.ts`：会话有值时用会话值 / 非 git 项目时独立不可选并给出原因 / 待生效值的呈现
  - [ ] 覆盖验收 #7 #8

- [ ] T3: runtime 改读会话级工作空间
  - [ ] `runtime.resolveWorkspace` 改为经 T2 判定读会话级值
  - [ ] 项目文件夹不可用时的既有运行期分流（直接改文件的立即停、隔离的跑完当前步）按会话级 `workspaceMode` 判定
  - [ ] 覆盖验收 #7

- [ ] T4: 真实分支名上行
  - [ ] `readCurrentBranch` 结果进入 state 序列化，按工作空间路径加缓存，run 收尾与工作空间切换时失效
  - [ ] detached HEAD 照实显示兜底值，不编造分支名
  - [ ] `composer-context` 分支格绑定真实名称，移除「当前分支 / 会话分支」字面词
  - [ ] 覆盖验收 #9

- [ ] T5: 切换工作空间接口与待生效语义
  - [ ] 新增 `PATCH /api/local-console/sessions/:id/workspace`
  - [ ] 该会话无 run 在跑时立即生效；有 run 在跑时写待生效列
  - [ ] run 收尾钩子把待生效值落定并清空待生效列，不重放已完成的步骤
  - [ ] 新增 `tests/local-console-pending-switch.test.ts`：有 run 时写待生效不写生效值 / run 结束后落定 / 落定后不重放 / 跨重启待生效仍在
  - [ ] 覆盖验收 #6

- [ ] T6: 切换团队接口
  - [ ] 新增 `PATCH /api/local-console/sessions/:id/team`，复用 T5 的待生效语义
  - [ ] 切换保留当前对话与全部已有上下文，由新团队接管之后的推进
  - [ ] 覆盖验收 #6

- [ ] T7: composer 上下文条抽出
  - [ ] 新增 `packages/console-ui/src/console/composer-context.tsx`，承载项目 / 工作空间 / 分支 / 团队四项，顺序固定
  - [ ] 从 `operator-console.tsx` 移出 `ComposerContext`，相关测试用例随组件迁移，不留空壳
  - [ ] 新增共置 Story
  - [ ] 覆盖验收 #5

- [ ] T8: 工作空间下拉与不可选说明
  - [ ] 工作空间从只读展示改为下拉：默认工作空间 / 独立工作空间
  - [ ] 项目文件夹不是 git 仓库时独立工作空间不可选，并在菜单内说明原因
  - [ ] 从默认切到独立时说清：副本基于项目当前所在的提交，不包含尚未提交的改动；此前已在项目文件夹产生的改动也不会被搬走
  - [ ] 从独立切回默认前说清：之后的改动会直接落在项目文件夹里
  - [ ] 覆盖验收 #8

- [ ] T9: 团队下拉与「创建时载入」说明
  - [ ] 新增 `packages/console-ui/src/console/session-team-menu.tsx`，取代无 onClick 的 `SessionAgentTeamButton`
  - [ ] 菜单内说明：这段对话用的是开始时载入的那份团队内容，之后在团队页的修改不影响它
  - [ ] 需要修复 / 已删除的团队仍在按钮上标红（表现细节由 `main-conversation-timeline-truth` 统一）
  - [ ] 覆盖验收 #20

- [ ] T10: 待生效切换的界面兑现
  - [ ] 有待生效切换时，上下文条显示「当前这一步跑完后生效」及目标值
  - [ ] 落定后提示消失，上下文条显示新值
  - [ ] 覆盖验收 #6

- [ ] T11: 真实桌面窗口验收
  - [ ] 同项目两段会话分设两种工作空间，各跑一次，互不影响
  - [ ] 分支格显示的名字与 `git branch --show-current` 一致
  - [ ] 团队下拉可改选，改完后续推进由新团队接管、历史保留
  - [ ] 推进中改选 → 出现「跑完当前这一步后生效」→ 跑完后生效，产物无半截改动
  - [ ] 项目指向非 git 目录 → 独立工作空间不可选并说明原因
  - [ ] 从默认切到独立 → 界面说清副本基线与两项不包含
  - [ ] 覆盖验收 #5 #6 #7 #8 #9 #20
