# 任务：agent-teams-runtime-binding

实施顺序 B → A → C → D。A3 依赖 B 的路径解析，D4 依赖 C 的路由入口，其余组内可并行。

## B. 团队标识与位置解耦

- [x] `team-record-store.ts`：记录位置改为可区分受管目录与外部绝对路径的结构，`locationForRecord` 据此分派
- [x] `team-record-store.ts`：记录文档 version 1 → 2，v1 的 `directoryName` 读为受管目录
- [x] `team-record-store.ts`：删除 `lastKnownMembers`，保留 `lastKnownDefinition`
- [x] `team-record-store.ts`：重新定位写回新位置本身，支持 `teams/` 以外的目标
- [x] `team-file-manager.ts`：用户团队改走 `resolveRecordedTeamLocation`，内置团队保持按 id 解析
- [x] `team-external-change.ts`：同上
- [x] `app.tsx`：外部修改检测的空 catch 改为落到成员 `loadError`
- [x] 单测：v1 → v2 迁移；重新定位到 `teams/` 之外后文件管理器与外部修改检测都能解析到；内置团队解析不受影响

## A. 团队 → 会话 → 执行

- [x] `sqlite-state-worker.ts`：`sessions` 表新增 `agent_team_ownership` / `agent_team_id`，可空，含存量库迁移
- [x] `sqlite-state.ts` 与 local console 读写路径：透传团队标识
- [x] local console 创建会话接口：接受团队标识并落库
- [x] `new-conversation.ts` / `state-sync.ts`：团队随创建请求一起提交，`last-used-team.json` 只负责下次预选
- [x] `local-console/server.ts` 与 `runtime.ts`：`listAgentFiles` 改为接受 `sessionId`
- [x] `desktop/src/main.ts`：启动 local console server 时注入按会话解析的实现（有绑定取团队成员，无绑定回退全局目录，需修复态返回明确错误）
- [x] `app.tsx`：拆出会话团队状态，`selectedAgentTeamKey` 改接它；`agentTeamSelection` 只服务团队页
- [x] `app.tsx` / `state-sync.ts`：既有轮询带回当前会话绑定团队的健康度
- [x] 单测：有绑定时名单严格等于团队成员；无绑定回退全局；需修复态报明确错误
- [x] 单测：创建会话落库与读回团队标识；存量 NULL 会话不受影响
- [x] 单测：团队页切换浏览团队时会话团队不变——**改写** `operator-console.test.tsx` 中直接灌 `selectedAgentTeamKey` 的测法，否则测不出本次主干缺陷
- [x] 单测：会话绑定团队转为需修复态后，发送在下一次轮询内被禁用

## C. 视图路由

- [x] `operator-console.tsx`：建立「带向对话」的单一入口，同时完成会话切换与主区回到对话视图
- [x] 四个出口改走该入口：侧边栏选择会话、新建对话成功、搜索跳转、归档或移除项目导致的会话切换
- [x] 单测：四个出口触发后主区均回到对话视图

## D. 详情页交互

- [x] `agent-team-detail.tsx`：外部冲突时返回改为弹出阻止说明并列出待处理成员
- [x] `agent-team-detail.test.tsx`：**改写**把静默失效固化成断言的那条用例
- [x] `agent-teams-page.tsx`：滚动位置恢复移入布局副作用，等列表 DOM 就位后再赋值
- [x] `agent-markdown-mention-editor.tsx`：处理输入法组字，组字期间不回写受控值、不重设光标
- [x] `agent-markdown-mention-editor.test.tsx`：用例走真实输入路径，不再直接赋 `textContent`
- [x] `operator-console.tsx`：有未保存草稿时经路由入口离开团队页，触发既有三选项
- [x] `agent-teams-page.tsx`：需修复态横行的成员区改为占位说明，不显示成员名称或数量
- [x] 单测：滚动恢复时机；组字不被打断；需修复态横行不出现成员名

## 验证

- [ ] 用 seed「开发团队」新建对话，发「每个人依次报数」，确认 `dev-manager` 报 1 并依次传递到 `dev`、`qa`，止于三人，无团队外角色介入
- [x] 把团队目录移到 `teams/` 之外并重新定位，确认「在文件管理器中打开」成功、外部修改检测生效
- [x] 在团队页点开一支需修复团队后点击侧边栏会话，确认主区回到时间线且输入框可用
- [x] 在应用外移走当前会话绑定的团队目录，不进团队页，确认发送在数秒内被禁用；移回后恢复
- [x] 中文输入法在 `AGENT.md` 编辑器中连续组字，确认不被打断、光标不跳

> 2026-07-21 实施验证：路径重定位、需修复传播、视图路由和 IME 均由自动化用例覆盖。真实 Codex「依次报数」会产生外部模型运行，本次未代用户触发；严格名单用例已确认绑定团队只暴露 `dev-manager`、`dev`、`qa`，且排除共享目录中的团队外角色。
