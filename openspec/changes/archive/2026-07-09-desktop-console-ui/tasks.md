# 任务：desktop-console-ui

## A. 近单色设计基线修订（诉求①）
- [x] 改写 `conversation-console/ui-design.md` §二/§三/§六/§七/§九：删「注意力层(琥珀)」，事实红换 Linear 红 `#E5484D`，裁决只用彩色文字（无 `-soft`），「等你」改中性 + 结构承载。
- [x] 同步 `conversation-console/wireframes.md` 里「配琥珀」类文字注释（版面/`✋` 图标不动）。
- [x] 自查走查清单第 1/4/7 条改成结构性断言，无自相矛盾。

## B. 前端包脚手架
- [x] `pnpm-workspace.yaml` 增列 `packages/*`。
- [x] 建 `packages/console-ui`：package.json（react / tailwind / radix / shadcn / storybook）、tsconfig、路径别名。
- [x] `components.json` + Tailwind 预设 + `src/styles/tokens.css`（沿用现有近单色令牌值）+ `globals.css`（映射到 shadcn 变量名 `--background/--foreground/--primary/--border/--muted/--destructive/--ring`）。

## C. 组件（先跑底座与样板；22 个复合项另起后续 change）
- [x] `shadcn add` 基础原语：button / badge / avatar / input / card / popover / dropdown-menu。
- [x] 样板：落 7 个基础原语 + 1 个复合（验收卡 accept-card）验证令牌链路与近单色。
- [x] 移除静态 `component-library/`，避免把 22 个 HTML 片段误读为已交付 React 组件。
- [ ] 【后续 change】按敲定粒度补齐 22 个对话操作台复合项（agent 折叠/运行块/账本树/事件流/上下文面板等组合件）。

## D. Storybook 展示台
- [x] 配 `.storybook/`（Tailwind + 令牌注入 + 浅/深主题 decorator）。
- [x] 每个已实现 React 组件一组 `*.stories.tsx`，args/controls 暴露状态变体。
- [x] `storybook` 脚本可起本地站，浏览器可查看。

## E. Electron 消费路径（只铺路）
- [x] 约定 `@moebius/console-ui` 可被 desktop renderer import；令牌 `globals.css` 可在 renderer 入口引入。
- [x] 记录后续 `desktop-console-app` change 的边界（renderer React app + Vite/esbuild 打包 + IPC/数据对接），本次不实现。

## F. 验证（AI 可执行）
- [x] 单元/契约测试：令牌映射（shadcn 变量解析到近单色值）、组件关键 props 渲染快照——含可测逻辑的组件（如验收卡逐条状态生成协议文本）必须单测。
- [x] AI 验证流程：起 Storybook，playwright 截图逐组件核对近单色（无琥珀残留、无 `-soft` 填充、danger=Linear 红），浅/深双主题各一遍。
- [x] grep 断言：组件源码无裸 hex、无 `att/琥珀`、无 `-soft`。

> 归档动作（移动目录 / 合并 spec-delta / 回流 wireframes）由 `openspec/changes/AGENTS.md` 统一定义，不在此列。
