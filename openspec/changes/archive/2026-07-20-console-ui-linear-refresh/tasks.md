# 任务：console-ui-linear-refresh

- [x] 字体资产入库：`src/styles/fonts/inter-var-latin-cv01.woff2` + OFL license；`globals.css` @font-face 与 `cv01/ss03`
- [x] 构建三路验证：console-ui `build`、`build-storybook`、desktop `build` 产物中 @font-face url 可解析（失败则按 design.md 回退方案处理）
- [x] `tokens.css`：冷灰阶、accent `#5E6AD2` 双主题 + `--accent-hover`、`--shadow-pop`、`--ring-focus`、动效令牌、`--radius` 6
- [x] `tailwind.config.ts`：InterVar 字体栈、fontWeight 510/590、accent-hover 色、shadow-overlay 接令牌
- [x] `globals.css`：focus-visible 双层 ring；`tokens.test.ts` 断言更新
- [x] `ui/button.tsx`：accent-hover、active scale(0.98)、过渡令牌
- [x] `ui/badge.tsx`：九 variant 全改圆点+文字（API 不变）+ story 更新
- [x] `ui/input.tsx`、`ui/dropdown-menu.tsx`、`ui/popover.tsx`：双层 ring、多层阴影、图标 1.5
- [x] `console/agent-message.tsx`：inbox 行重构（圆头像+stage 角标、右侧状态图标+时间、发丝线、hover 行底色）+ 测试/story 更新；`parseAgentMarkdown` 用例不动
- [x] `console/conversation-sidebar.tsx`：图标 strokeWidth 1.5、状态点语义对齐 badge
- [x] `console/session-context-header.tsx`：属性面板式
- [x] `console/accept-card.tsx`：裁决改圆点+文字
- [x] desktop `console.css` 只读核对，冲突才微调
- [x] 新增 `packages/console-ui/DESIGN.md`：令牌纪律、排版、图标、状态语义与色相预算、elevation/focus/动效红线、组件模式目录（指向组件源码）、灵感来源溯源、新模式回流机制
- [x] AI 验证：playwright 截 button / badge / agent-message / accept-card / conversation-sidebar / operator-console 六组 story 亮+暗截图逐张核对
- [x] `pnpm test`、根 `pnpm typecheck`、desktop `build` 全绿
