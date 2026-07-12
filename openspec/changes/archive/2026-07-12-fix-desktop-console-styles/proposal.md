# 提案：fix-desktop-console-styles

## 背景
Electron 操作台虽然复用了 `@agent-moebius/console-ui` 的 React 组件，但桌面构建只用 esbuild 的 CSS loader 复制了 `globals.css`，没有执行 Tailwind/PostCSS。最终 `app.css` 仍包含 `@tailwind` / `@apply` 指令，Chromium 无法生成组件 utility 样式，页面退化为裸 HTML 与一份不完整的桌面兜底 CSS。

## 提案
- 让 `@agent-moebius/console-ui` 在 package build 阶段生成完整编译的 `dist/style.css`，并通过 `globals.css` package export 暴露该产物。
- 让 desktop build 先构建 workspace UI package，再打包 renderer，保证组件代码与样式产物来自同一个 package 边界。
- 将桌面 `console.css` 收缩为 Electron 页面宿主样式，不再复制组件布局、按钮和输入框视觉规则。
- 在桌面构建中校验 renderer CSS 已编译且包含组件库关键 utility，防止未编译 Tailwind 指令再次进入应用。

## 影响
- 影响 `packages/console-ui` 的样式发布契约与构建脚本。
- 影响 `desktop` renderer 的构建顺序、CSS 产物校验和页面宿主样式。
- 不改变组件 API、本地操作台数据流、IPC、页面信息架构或现有视觉设计。
