# 任务:agent-teams-ai-entry

## 1. clarifying(implement 段前必做)

- [ ] 与用户对齐「新建团队」菜单形态(dropdown / popover)
- [ ] 与用户对齐 AI 建队主体 view 是否保留 Agent 团队页顶部 nav
- [ ] 确认 `ai-team-builder-service` 提供的 `<TeamBuilderView>` 组件 API 与本 change 期望一致

## 2. view state 改造

- [ ] `agent-teams-page.tsx` 引入 tagged union view state:`list` / `team-detail` / `ai-builder` / `information-dialog`
- [ ] 现有 team-detail / information-dialog 路径迁移到新 view state,不改行为
- [ ] 若 team-detail 走 URL/router,`ai-builder` 也走同一机制,防刷新掉状态

## 3. 「新建团队」按钮换菜单

- [ ] `agent-teams-page.tsx:461-466` 改为 DropdownMenu(或 popover 等价)
- [ ] 两个菜单项:「跟 AI 聊出一支新团队」→ `setView({ kind: "ai-builder" })`;「从空白开始」→ 现有 `openInformationDialog()`
- [ ] 「复制并编辑」保持在只读团队详情里,不动

## 4. AI 建队主体 view

- [ ] `view.kind === "ai-builder"` 时把 main 区替换为 `<TeamBuilderView>`(含「返回 Agent 团队」按钮)
- [ ] 顶部 nav / 返回按钮样式**对照 `docs/product/pages/onboarding.prototype.html` 的 AI 建队子流程区块**,冲突以 agent-teams.md 正文为准
- [ ] `onSelected(teamId)` → `setView({ kind: "team-detail", teamId })`(进新团队详情)
- [ ] `onCancel` → `setView({ kind: "list" })`
- [ ] 走 DESIGN.md 令牌,亮暗双主题

## 5. 断言不写 last-used

- [ ] 单测:AI 建队 selected 后 `last-used-team.json` 不被写入
- [ ] 单测:AI 建队草稿不出现在 `listAgentTeams()` 返回值中

## 6. spec-delta

- [ ] `openspec/changes/agent-teams-ai-entry/spec-delta/console-ui/spec.md` 写 Requirement:「新建团队」菜单三路径 / AI 建队主体 view / 草稿不入列表 / 不改 last-used

## 7. 验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] 手工路径:Agent 团队页 → 「新建团队」→ 「跟 AI 聊出一支新团队」→ 走 AI 建队 → 创建 → 落到新团队详情
- [ ] 手工路径:Agent 团队页 → 「新建团队」→ 「从空白开始」→ TeamInformationDialog(空白路径保持原行为)
- [ ] 手工路径:只读团队详情 → 「复制并编辑」(不动)
- [ ] 断言:创建后打开新建对话,预选团队仍是「上一次成功创建会话使用的团队」,不是新 AI 团队
