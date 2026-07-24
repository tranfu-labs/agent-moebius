# 设计：console-ui-flat-anchor

## 方案

### 组件库视觉锚

`Card` 变为扁平容器基线：

- 默认无阴影。
- 默认方角或极小半径，优先移除 `rounded-lg` 带来的软卡片观感。
- 保留 `border border-line bg-card text-ink` 的结构事实，但由组件统一承载，调用点不再手写等价卡片。
- `CardHeader`、`CardContent`、`CardTitle` 继续保留，避免影响 `accept-card` 与 Storybook 的组件组合方式。

`Badge` 变为状态事实基线：

- `variant` 只接受 status 语义，不保留 `neutral / selected / accent / pass / danger` alias。
- 覆盖 `OperatorSessionStatus` 和 `OperatorMessageStatus` 当前需要的状态：`idle / running / waiting / pending / completed / displayed / failed / stuck / interrupted`。
- `running` 使用 indigo 交互强调；`failed / stuck` 使用 danger 事实色；`waiting / pending` 使用中性结构信号；`interrupted / idle / completed / displayed` 使用中性事实信号。
- 不把 `completed / displayed` 映射为 `pass` 绿色，因为 pass/fail 是验收裁决语义，不是本地运行状态语义。

### OperatorConsole 回收组件

`operator-console.tsx` 的主内容区做三类替换：

1. `StatusBadge` 删除，新增窄映射函数把 session/message status 映射到 `<Badge variant={...}>`。
2. `RunLiveBlock` 根容器改为 `<Card className="mb-3 p-3">`，内部直播摘要、runDir、cwd、interrupt button 和 stdout summary 保持不变。
3. `TimelineMessage` 根容器由 `<article>` 改为 `<Card>`，状态 tone 只通过 `Card` 的 `className` 覆盖边框 / 背景，不再手写一个平行卡片系统。

侧栏 project/session 行继续是导航按钮，不改成 Card。它们不是本任务中的卡片 / 徽章替代对象，保留当前紧凑树形扫描体验。

### Storybook 与测试

- `badge.stories.tsx` 改成 status 语义 select options，并展示 running / waiting / failed / interrupted / idle / stuck 等状态。
- `card.stories.tsx` 保持 Card + Badge 组合，但 Badge 使用 status variant。
- `operator-console.test.tsx` 若当前没有覆盖组件回收边界，则补充主内容区渲染断言，确保状态文本仍可见、active run 与 message rows 渲染不回退。
- `accept-card.test.tsx` 继续作为验收协议与交互回归；视觉回归通过截图和 Storybook 检查覆盖。

### 验收证据

- Storybook：启动 `pnpm --filter @moebius/console-ui storybook` 后检查 Card / Badge stories 与 OperatorConsole story。
- 桌面 renderer 截图：优先复用 `pnpm exec tsx scripts/acceptance/local-console-t4.ts` 产出的 `artifacts/acceptance/t4-live.png`、`t4-interrupted.png`、`t4-failed.png`；若截图不同时覆盖状态徽章、时间线消息和 RunLiveBlock，则在该脚本或等价最小 fixture 中补足。
- Grep gate：对 `operator-console.tsx` 的主内容区执行 `grep -nE 'border border-line|<article'`，要求 0 命中。
- 命令回归：`pnpm --filter @moebius/console-ui test`、`pnpm --filter @moebius/desktop build`、`pnpm typecheck`。
- Roadmap：实现完成后在 `docs/roadmap/milestone-4-local-console.md` 的 T6 下方追记证据并勾选 `[x]`。

## 权衡

- 选择破坏式 `Badge` 语义收敛，而不是保留 alias：需求持有者已确认旧变体主要出现在仓库内 story 示例，不需要为了假想外部使用者保留旧 API。
- 选择复用现有 Card / Badge，而不是新增 `MessageCard` / `StatusBadge` 复合组件：本任务目标是让默认组件足够可用，避免继续形成一个主界面私有样式层。
- 不把侧栏导航按钮改成 Card：侧栏行是导航语义，改成卡片会扩大范围并破坏 T5 树形扫描密度。
- 不新增视觉主题或渐变：项目锚点是近单色、扁平、紧凑；状态色只表达事实或交互。

## 风险

- `Badge` variant 破坏式变更会让遗漏的旧调用点在 typecheck 阶段失败。缓解方式是先用 `rg "variant=\"(neutral|selected|accent|pass|danger)\"|<Badge"` 全量核对并迁移仓库内调用点。
- `Card` 默认半径变化会影响 `accept-card`、Card story 和任何未来复用者。缓解方式是以 `accept-card` 为活参考回归截图和测试，不在调用点用局部大圆角把默认锚点改回去。
- Grep gate 是机械检查，可能误伤主内容区非卡片控件。实现时应避免在 `<main>` 内继续出现 `border border-line` 精确串，同时不改变输入控件语义。
- 视觉一致性不适合只靠单元测试判断。必须提供 Storybook / desktop renderer 截图和命令证据。
