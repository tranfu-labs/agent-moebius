# 设计：fix-desktop-console-styles

## 方案
1. `console-ui` 从独立 package style entry 引入现有 `src/styles/globals.css`，让既有 Vite/PostCSS/Tailwind 构建链在 `dist/style.css` 生成已经展开 base/components/utilities 与 `@apply` 的样式。
2. package export `@agent-moebius/console-ui/globals.css` 指向 `dist/style.css`。Storybook 仍直接使用源码样式，由其 Vite/PostCSS 链处理。
3. desktop 的 `build` script 先运行 `console-ui build`，随后执行现有 esbuild renderer bundling；renderer 源码和 import 写法保持不变。
4. renderer 构建后读取 `dist/console-page/app.css`，通过可单测的契约函数拒绝残留 `@tailwind` / `@apply`，并要求存在代表组件库的 `.flex`、`.grid`、`.bg-canvas`、`.text-ink` utility。
5. `console.css` 只保留 `html/body/#root` 的窗口高度、外边距和 overflow 宿主约束，组件布局与视觉完全交还 `console-ui`。

## 权衡
- 选择由组件库既有 Vite 构建发布编译 CSS，而不是给 Electron 单独配置一套 Tailwind 或新增第二条 CSS CLI，是为了让所有消费者共享同一份令牌、content 扫描和 utility 产物，避免桌面层复制组件库的构建知识。
- 保留独立的最小 `console.css`，因为窗口根节点的满高与 overflow 属于 Electron 宿主职责，不属于复用组件的视觉规则。
- 不新增 wireframe：本次恢复既有组件库版式，不改变页面结构或交互布局。

## 测试与验证
- 单元测试：未编译 CSS（含 `@tailwind` 或缺少关键 utility）必须被契约函数拒绝；完整 CSS 必须通过。
- 构建验证：运行 desktop build，产物中不得残留 `@tailwind` / `@apply`，并能找到关键 utility。
- 回归验证：运行 desktop 与 console-ui 测试、项目 typecheck。
- AI 视觉验证：启动或加载构建后的 renderer，截图确认侧栏、会话头、空状态、按钮和输入区采用现有组件库样式。

## 风险
- Tailwind content 扫描遗漏会造成部分 utility 缺失；构建契约覆盖基础 utility，视觉截图覆盖组合组件。
- desktop build 多一步 package build，会增加少量构建时间，但换取确定的 package 产物边界。
- 回滚时可恢复 CSS export 与 desktop build script；不涉及运行时状态迁移。
