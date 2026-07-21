# 提案：agent-teams-implementation

## 背景

`docs/product/pages/agent-teams.md` 已作为 Agent 团队页的事实源，状态标注「已确认，可开发」，含 11 条验收标准。

上一轮 `main-sidebar-implementation` 已经把入口接通：`packages/console-ui/src/console/operator-console.tsx` 有 `OperatorApplicationView = "conversation" | "agent-teams"`，侧边栏顶部「Agent 团队」按钮可点击，切换后渲染一个占位视图，文案明确写着「Agent 团队管理界面将在后续任务中提供。当前入口与返回路径已经接通」。本 change 就是把这个占位填实。

代码核实发现一处**机制冲突**，不是单纯的「缺少」：

`desktop/src/data-root.ts` 的 `buildSeedCopyPlan` 在目标文件已存在时把它推进 `skippedDestinations` 并跳过，即「首次播种，之后永不覆盖」。这个语义对 `agents/`（用户可修改的 guardrail 文件）是正确的，但对内置团队是错的——内置团队会永远冻结在用户首次安装时的版本，后续产品对内置团队的改进无法下发。

而 `agent-teams.md` 规定内置团队全部只读（第 119、263、303 行），这恰好使覆盖更新变得安全：没有用户修改需要保护。因此内置团队必须走一条与 `agents/` 相反的播种规则，不能复用同一套跳过逻辑。

参照 codex 的实际布局：内置能力解包到 `~/.codex/skills/.system/`，由 `.codex-system-skills.marker` 内容指纹驱动整体覆盖；用户能力平级放在 `~/.codex/skills/<name>/` 不受影响。本 change 采用同一形状与同一 `.system` 命名。

## 提案

本 change 覆盖 15 条实施任务（见 `tasks.md`），按依赖顺序组织，允许并行的分支由仓库外的 loop 调度器在多 git worktree 上推进；本 change 不引入调度器代码。

磁盘布局：

```
仓库 seeds/teams/<slug>/            → extraResources 打包为 seed/teams
<dataRoot>/teams/
├── .system/                        ← 内置区，指纹不匹配时整体覆盖
│   ├── .teams-seed.marker
│   └── <builtin-team>/{team.json, members/<slug>/AGENT.md}
└── <user-team-id>/                 ← 用户区，产品永不覆盖
```

`<dataRoot>` 沿用 `resolveDesktopDataRoot`：打包后为 `~/.agent-moebius`，开发时为仓库根。

产品行为的**唯一事实源**保持为 `docs/product/pages/agent-teams.md`；spec-delta 只登记足以让机器判定「是否符合」的行为规则。

## 影响

受影响模块：

- `packages/console-ui/src/console/operator-console.tsx`：`agent-teams` 占位视图替换为真实容器，接入团队首页与团队详情两级视图；侧边栏入口新增「需要修复」红点。
- `packages/console-ui/src/console/` 新增团队首页横行、团队详情、成员选择器、`AGENT.md` 编辑区、`@slug` 提及组件及各自的 test 与 stories。
- `desktop/src/data-root.ts`：新增内置团队种子的指纹覆盖播种，与现有 `buildSeedCopyPlan` 的「存在即跳过」并存但互不干扰。
- `desktop/package.json`：`extraResources` 新增 `seeds/teams` → `seed/teams`。
- `desktop/src/main.ts`、`desktop/src/preload.ts`：新增团队读写、在文件管理器中打开、移到废纸篓等 IPC。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`：团队数据载入、外部修改检测与选择态维护。
- `src/local-console/`：记录「上一次成功创建会话所用团队」。
- 仓库新增 `seeds/teams/`：内置团队的种子内容。

对外行为：

- Agent 团队页从占位变为可用：陈列、进入详情、创建草稿、添加成员、编辑 `AGENT.md`、切换主 Agent、复制、删除、修复。
- 内置团队随应用升级更新，用户团队不受影响。
- 团队或成员文件不可用时，团队标记「需要修复」，侧边栏入口出现红点，该团队不能用于新建对话。

不受影响：GitHub runner、`agents/*.md` guardrail 及其现有播种规则、Codex driver、goal-ledger、marketing-site。

## 非目标

沿用 `agent-teams.md` 的非目标清单，其中对本 change 影响最大的三条：不做团队发现与在线市场（因此不引入类似 codex `vendor_imports` 的远程精选缓存）；不做 `AGENT.md` 之外的文件编辑器、文件树、逐行 diff 或自动合并；不做会话内团队切换与异常恢复的完整交互（留给会话交互 PRD）。
