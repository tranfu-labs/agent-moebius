# 任务:agent-teams-ai-entry

## 1. clarifying(implement 段前必做)

- [x] 与用户对齐「新建团队」菜单形态(dropdown / popover)
- [x] 与用户对齐 AI 建队主体 view 是否保留 Agent 团队页顶部 nav
- [x] 验签 `ai-team-builder-service` 的 `<TeamBuilderView>`：实际为受控 `state` + `onBack/onSubmit/onAdjust/onRetry/onCommit` API，由 desktop `App` 适配

## 2. view state 改造

- [x] `agent-teams-page.tsx` 引入 tagged union view state:`list` / `team-detail` / `ai-builder` / `information-dialog`
- [x] 现有 team-detail / information-dialog 路径迁移到新 view state,不改行为
- [x] 若 team-detail 走 URL/router,`ai-builder` 也走同一机制,防刷新掉状态(现有 team-detail 不走 URL/router)

## 3. 「新建团队」按钮换菜单

- [x] `agent-teams-page.tsx:461-466` 改为 DropdownMenu(或 popover 等价)
- [x] 两个菜单项:「跟 AI 聊出一支新团队」→ `setView({ kind: "ai-builder" })`;「从空白开始」→ 现有 `openInformationDialog()`
- [x] 「复制并编辑」保持在只读团队详情里,不动

## 4. AI 建队主体 view

- [x] `view.kind === "ai-builder"` 时把 main 区替换为 `<TeamBuilderView>`(含「返回 Agent 团队」按钮)
- [x] 顶部 nav / 返回按钮样式**对照 `docs/product/pages/onboarding.prototype.html` 的 AI 建队子流程区块**,冲突以 agent-teams.md 正文为准
- [x] selected team id → `setView({ kind: "team-detail", teamKey })`(进新团队详情;适配受控组件实际 API)
- [x] `onBack` → `setView({ kind: "list" })`
- [x] 走 DESIGN.md 令牌,亮暗双主题

## 5. 断言不写 last-used

- [x] 单测:AI 建队 selected 后 `last-used-team.json` 不被写入
- [x] 单测:AI 建队草稿不出现在 `listAgentTeams()` 返回值中

## 6. spec-delta

- [x] `openspec/changes/agent-teams-ai-entry/spec-delta/console-ui/spec.md` 按 agent-teams#4 / #6 各写一个 Requirement

## 7. 验证

- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 已执行（569/570；既有 `local-console-workspace-diff.test.ts` 在当前环境把缺失 rollout 报为 `unreadable`，断言仍期望 `not-found`；本 change 未修改该测试或实现，定向复跑结果一致，用户已接受为非阻塞）
- [x] 路径验收:Agent 团队页 → 「新建团队」→ 「跟 AI 聊出一支新团队」→ 走 AI 建队 → 创建 → 落到新团队详情（最外层 desktop `App` 集成测试 + web-shell 实际渲染巡检）
- [x] 路径验收:Agent 团队页 → 「新建团队」→ 「从空白开始」→ TeamInformationDialog（最外层页面交互测试 + web-shell 实际渲染巡检）
- [x] 路径验收:只读团队详情 → 「复制并编辑」（既有共享语义测试回扫通过）
- [x] 断言:创建后打开新建对话,预选团队仍是「上一次成功创建会话使用的团队」,不是新 AI 团队
