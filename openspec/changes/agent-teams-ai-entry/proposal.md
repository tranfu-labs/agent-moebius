# 提案:agent-teams-ai-entry

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/agent-teams.md | § 跟 AI 聊出一支新团队 / § 页面标题与新建入口 / § AI 建队 / 页面状态表「AI 建队草稿」行 / 验收 #4 #6 | 定义「新建团队」菜单展开 AI 建队 与 从空白开始;AI 建队占用页面主体(非弹层);「AI 建队草稿」不入列表 | 已写入 |
| docs/product/pages/onboarding.md | § AI 建队技术约束(共享) | AI 建队 UI 触发面复用 ai-team-builder-service 的 `<TeamBuilderView>` | 已写入 |
| docs/product/pages/onboarding.prototype.html | AI 建队子流程区块 | AI 建队视觉/交互(虽然原型主要面向 onboarding,但 UI 主体在两处复用)。**Agent 团队页承接时对照实现**,冲突以 agent-teams.md + onboarding.md 正文为准 | 参考 |

## 背景

现有 `packages/console-ui/src/console/agent-teams-page.tsx:461-466, 513-529` 的「新建团队」按钮直接打开 `TeamInformationDialog`(单路径「从空白开始」)。PRD 明确:

- 「新建团队」展开后同时提供「跟 AI 聊出一支新团队」和「从空白开始」两个子入口
- 「复制并编辑」仍只出现在已有团队详情中,不塞进「新建团队」菜单
- AI 建队使用**页面主体**,不把多轮对话塞进弹窗
- 未确认的 AI 对话和方案是**建队草稿**,不属于正式团队,不显示在团队首页,也不参与新建对话选择
- 从 Agent 团队页创建成功**不改变「上一次成功创建会话时使用的团队」**
- 三条路径(AI 建队、从空白开始、复制并编辑)最终产生**同一种用户团队**

## 提案

1. **「新建团队」按钮改成菜单**:点击后弹出两个选项——「跟 AI 聊出一支新团队」/「从空白开始」;「从空白开始」保持现有 `TeamInformationDialog` 交互不动
2. **AI 建队页面主体 view**:选「跟 AI 聊出一支新团队」→ Agent 团队页切换到 `<TeamBuilderView>` 全屏主体(左上返回按钮回到团队列表);不打开 dialog,不复用普通会话组件
3. **`<TeamBuilderView>`**:直接消费 `ai-team-builder-service` 前置 change 提供的 console-ui 组件,不重写
4. **草稿态**:AI 建队草稿只存活于 `<TeamBuilderView>` 内部(由 service 管);团队列表 `listAgentTeams()` 天然不含它
5. **状态表 `AI 建队草稿` 行**:仅作为文档层枚举,不入 `team-model.ts:TeamStatus`
6. **创建成功后跳转**:AI 建队 `selected(teamId)` → 进新团队详情;不写 `last-used-team.json`
7. **「复制并编辑」不动**:agent-teams-page.tsx:343-358 已合规

## 影响

- **新增**:无(消费前置 change 的组件)
- **修改**:
  - `packages/console-ui/src/console/agent-teams-page.tsx:461-466` — 「新建团队」按钮换成菜单
  - `packages/console-ui/src/console/agent-teams-page.tsx:513-529` — 保留 `TeamInformationDialog` 但只承载「从空白开始」
  - `packages/console-ui/src/console/agent-teams-page.tsx` — 新增 view state:`list` | `ai-builder` | `information-dialog`;`ai-builder` 时用主体渲染 `<TeamBuilderView>`
- **不动**:
  - `desktop/src/team-store.ts:createUserTeam / addTeamMember`(空白路径完全不变)
  - `desktop/src/team-ipc.ts:listAgentTeams`(草稿本来就不在里面)
  - `desktop/src/team-conversation-preference.ts`(AI 建队不改 last-used)
  - `desktop/src/team-model.ts:TeamStatus`(AI 建队草稿态不入枚举)
- **依赖前置**:`ai-team-builder-service`(提供 `<TeamBuilderView>` + service + IPC + 原子 writer)

## PRD 缺口

- **AI 建队页面主体展示形态**:全屏覆盖 vs 保留 Agent 团队页的顶部 nav?PRD 说「使用页面主体」,视觉细节留待 codex 对照原型 clarifying
- **「新建团队」菜单形态**:dropdown menu vs 弹层小卡片,PRD 未指定。参考原型或按 DESIGN.md 约定选一种,codex clarifying 确认
