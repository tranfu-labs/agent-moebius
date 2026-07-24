# 设计:agent-teams-ai-entry

## 覆盖的验收落点

从 `~/dev-loops/moebius/onboarding/rule-binding.md` 抄过来:

### agent-teams.md 验收

- **#4** 「新建团队」同时提供 AI 建队与从空白开始;复制并编辑仍从明确已有团队详情发起;三条路径最终产生同一种用户团队 — 「新建团队」按钮换菜单 + 「复制并编辑」保留在已有团队详情
- **#6** AI 建队未确认时不产生列表项;确认后一次创建含 2-6 成员/唯一主 Agent/全部有效 AGENT.md;失败不留半成品 — 消费 `ai-team-builder-service` 的原子 writer

### 相关规则句

- **规则句 8** 「新建团队」菜单展开两分支 → `agent-teams-page.tsx:461-466` 承接
- **规则句 21** 「AI 建队草稿」独立第四种状态,不进 `listAgentTeams` — `team-ipc.ts` 已合规,本 change 消费即可
- **规则句 24** 「从 Agent 团队页创建成功不改变 last-used」 → 消费方不调 `recordSuccessfulConversationAgentTeam`;`ai-team-builder-service` writer 已不写 last-used
- **规则句 25** 「AI 建队使用页面主体,不塞弹窗」 → agent-teams-page view state 新增 `ai-builder` 分支渲染主体

## 方案

### 页面 view state

```typescript
type AgentTeamsPageView =
  | { kind: "list" }
  | { kind: "team-detail"; teamId: string }
  | { kind: "ai-builder" }            // 新增
  | { kind: "information-dialog"; ... };  // 保留(空白路径用)
```

### 「新建团队」按钮改菜单

原代码(`agent-teams-page.tsx:461-466`):

```tsx
<Button onClick={() => openInformationDialog()}>新建团队</Button>
```

改为:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>新建团队</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onSelect={() => setView({ kind: "ai-builder" })}>
      跟 AI 聊出一支新团队
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => openInformationDialog()}>
      从空白开始
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

(具体组件 API 按 `packages/console-ui/` 现有约定;若无 DropdownMenu 用等价方案)

### AI 建队主体 view

`view.kind === "ai-builder"` 时,把 `<AgentTeamsPageMain>` 内容替换为:

```tsx
<div className="ai-builder-main">
  <TeamBuilderView
    state={aiTeamBuilder.state}
    backLabel="返回 Agent 团队"
    onBack={() => setView({ kind: "list" })}
    onSubmit={aiTeamBuilder.onSubmit}
    onAdjust={aiTeamBuilder.onAdjust}
    onRetry={aiTeamBuilder.onRetry}
    onCommit={async (revision) => {
      const selectedTeam = await aiTeamBuilder.onCommit(revision);
      if (selectedTeam !== null) {
        setView({ kind: "team-detail", teamId: selectedTeam.teamKey });
      }
    }}
  />
</div>
```

desktop console 顶部导航和侧栏继续保留;返回按钮复用 `TeamBuilderView` 对照原型实现的左上按钮,不叠加第二个返回控件。前置 change 的组件实际是受控组件,由 desktop App 通过 preload 消费 IPC、持有白名单 DTO,并在 selected 后刷新团队列表、进入既有详情。

### 运行时消费边界

```text
desktop main
  registerAiTeamBuilderIpc(AiTeamBuilder)
      ↓ preload 白名单方法
desktop App（草稿 id + 受控 DTO + selected 团队刷新）
      ↓ OperatorConsole props
AgentTeamsPage（view state）
      ↓
TeamBuilderView
```

草稿 id 在 Agent 团队入口内保持稳定以支持退出后恢复;selected 后清除入口指针,下一次建队使用新的草稿 id。renderer 不接触 thread id、运行目录或原始 Codex 输出。

### 「复制并编辑」不动

`agent-teams-page.tsx:343-358` 已合规——「复制并编辑」出现在只读团队详情内,不在「新建团队」菜单里。本 change 不动。

### 三条路径的落点收敛

- **AI 建队** → `TeamBuilderView` → `ai-team-builder-service` 原子 writer → 普通用户团队
- **从空白开始** → `TeamInformationDialog` → `team-store.createUserTeam()` → 普通用户团队(现有,不动)
- **复制并编辑** → 已有团队详情 → 复制目录 → 普通用户团队(现有,不动)

三条路径最终写入 `teams/` 后由 `team-record-store.registerUserTeamSnapshot` 一视同仁登记,天然产生同一种用户团队。

## 权衡

- **view state 用 tagged union vs 多个 boolean flags**:选 tagged union,理由:三种 view 互斥,tagged union 编译期防「同时打开 dialog + ai-builder」的死角
- **AI 建队主体替换整个 main 区 vs 覆盖层**:选替换整个 main 区,理由:PRD 说「使用页面主体,不把多轮对话塞进弹窗」,覆盖层视觉上仍像 modal,与 PRD 意图不符
- **不重写 TeamBuilderView**:消费 `ai-team-builder-service` 提供的组件,避免 UI 重复实现分叉

## 风险

- **DropdownMenu 组件不存在**:`packages/console-ui/` 若无现成 DropdownMenu,用 Popover + list 等价,别引入新依赖
- **view state 与既有 team-detail 路由的兼容**:agent-teams-page.tsx 现有 team-detail 是否通过 URL / router 表达?若是,新的 ai-builder view 也要走同样路径,否则页面刷新会掉状态
- **`TeamBuilderView` 的受控回调契约(已解除)**:implement clarifying 已验签为 `state + onBack / onSubmit / onAdjust / onRetry / onCommit`;selected team id 从 IPC DTO 解析后由 desktop App 刷新正式团队并返回页面详情
- **console-ui 写盘冲突**:本 change 与 `onboarding-relay-demo` 都改 `packages/console-ui/`。DAG 已让 relay-demo 依赖本 change,序列化写盘
