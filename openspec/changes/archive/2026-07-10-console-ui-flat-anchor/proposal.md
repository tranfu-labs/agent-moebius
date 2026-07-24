# 提案：console-ui-flat-anchor

## 背景
M4 T6 要把 `console-ui` 的组件库视觉锚拉回到本地对话操作台的 Linear 式扁平语言：方角、细边、紧凑、纯色扁平按钮，阴影只留给浮层。当前问题是组件库和主界面没有同一默认基线：

- `packages/console-ui/src/ui/card.tsx` 的 `Card` 默认 `rounded-lg`，容易形成偏浮起的卡片观感。
- `packages/console-ui/src/ui/badge.tsx` 仍使用 `neutral / selected / accent / pass / danger` 这类通用变体，没有贴合本地操作台的运行状态语义。
- `packages/console-ui/src/console/operator-console.tsx` 在主内容区用原生容器和手写 Tailwind 重做了 `RunLiveBlock`、`TimelineMessage`、`StatusBadge`，绕开了组件库。

需求持有者已确认：

- `Badge` 允许破坏式收敛到 status 语义，不保留旧通用变体 alias。
- `code-verified` 阶段的桌面台截图证据可使用现有 fake local console / acceptance 流程，证据需说明截图来自 desktop renderer。
- 范围按 T6 原文最小化：不动侧栏 project/session 导航按钮，不动 runner / 后端，不承接 T7，不引入浮起、premium、渐变观感。

## 提案
本 change 规划一个展示层收敛切片：

1. **扁平化 `Card` 默认锚点**：把 `Card` 默认样式改为方角或极小半径、细边、无阴影、紧凑默认结构；保留 `CardHeader` / `CardContent` / `CardTitle` 的源码组件形态，让 `accept-card` 继续作为正确用法样例。
2. **收敛 `Badge` 到 status 语义**：删除旧 `neutral / selected / accent / pass / danger` 变体，改为 `running / failed / waiting / interrupted / idle` 等状态语义；同步覆盖 message/session 现有状态所需的 `pending / completed / displayed / stuck`，其中 `pending` 以等待态视觉呈现，`completed / displayed` 保持中性完成事实，不复用 pass verdict 语义。
3. **主界面回收组件**：在 `operator-console.tsx` 中用 `<Badge>` 替换 `StatusBadge`，用 `<Card>` 替换 `RunLiveBlock` 和 `TimelineMessage` 的卡片容器，删除主内容区 `<article>` 与手写 `border border-line` 卡片/徽章形态；侧栏 project/session 导航按钮保持导航语义，不改成卡片。
4. **Storybook 与样例同步**：更新 `card.stories.tsx` / `badge.stories.tsx`，展示与主界面一致的扁平 Card / status Badge；回归 `accept-card` 视觉和交互。
5. **验证证据与收尾**：使用 `console-ui` test、desktop build、typecheck、Storybook 手动/截图验证、fake local console desktop renderer 截图、grep gate、roadmap T6 证据追记、commit/push/PR 完成收尾。

## 影响
受影响模块：

- `packages/console-ui/src/ui/card.tsx`：调整默认视觉锚，不改变组件导出形态。
- `packages/console-ui/src/ui/badge.tsx`：破坏式替换 `Badge` variant union，旧通用 variant 不保留 alias。
- `packages/console-ui/src/ui/badge.stories.tsx`、`packages/console-ui/src/ui/card.stories.tsx`：同步 status 语义和扁平样例。
- `packages/console-ui/src/console/operator-console.tsx`：主内容区回收 `Card` / `Badge`，保留侧栏导航按钮语义。
- `packages/console-ui/src/console/operator-console.test.tsx`、`accept-card` 相关测试：按必要性补强渲染断言。
- `scripts/acceptance/local-console-t4.ts` 或等价最小 fixture：若现有截图没有同时覆盖状态徽章、时间线消息和 RunLiveBlock，则补足 renderer 截图证据。
- `docs/roadmap/milestone-4-local-console.md`：实现完成后勾选 T6 并追记验收证据。

对外行为：

- `console-ui` 使用者看到 Card / Badge 与本地操作台主界面共用同一扁平视觉锚。
- `Badge` 旧通用变体不再可用；当前仓库内调用点同步迁移到 status 语义。
- 桌面操作台渲染数据流、IPC、runner、local console 后端语义不变。

## 验收语句
1. 跑 `pnpm --filter @moebius/console-ui storybook` → 应看到 `UI/Card`、`UI/Badge` 与 `OperatorConsole` 主界面视觉一致，不出现“组件库偏浮起、主界面偏扁平”两套观感。
2. 运行 fake local console / acceptance renderer 并打开桌面台会话页截图 → 应看到时间线消息、`RunLiveBlock`、状态徽章的圆角、边框、内边距与 `accept-card` 规范样例、Linear 扁平锚一致，且截图证据来自 desktop renderer 页面。
3. 在 `packages/console-ui/src/console/operator-console.tsx` 主内容区跑 `grep -nE 'border border-line|<article'` → 应命中 0，卡片和徽章全部通过组件承载；侧栏 project/session 导航按钮不纳入卡片/徽章回收。
4. 跑 `pnpm --filter @moebius/console-ui test`、`pnpm --filter @moebius/desktop build`、`pnpm typecheck` → 应全部退出码 0。
5. 回归 `packages/console-ui/src/console/accept-card.tsx` 规范样例视觉与交互 → 应看到 Card 默认扁平锚后样例无回退，验收协议格式化测试仍通过。

细化说明：以上 5 条沿用 T6 原文验收场景 (a)-(e)，只把 (b) 的截图来源按 product-manager 确认细化为 fake local console / acceptance renderer，把 (c) 明确为主内容区 card/badge 回收 gate，并保留侧栏导航按钮不纳入本任务的边界。
