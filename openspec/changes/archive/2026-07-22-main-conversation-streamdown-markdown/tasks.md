# 任务：main-conversation-streamdown-markdown

- [x] Codex 可见事件适配
  - [x] 为 `src/codex.ts` 增加 1 MiB 单行上限的增量 JSONL line framer、可选 Agent 可见文本回调与 Markdown 纯提取器。
  - [x] 保持 stdout/stderr 落盘、watchdog、最终文本与 GitHub runner 行为不变。
  - [x] 覆盖 chunk 断行、malformed、未知事件、两段 agent message、命令噪音与回调异常测试。
- [x] local active snapshot
  - [x] 在 `ActiveLocalRun` 与 `LocalConsoleRunSnapshot` 增加只存在内存/API 的 `liveMarkdown`。
  - [x] 同一 run 只替换最新 Agent 段，拒绝 stale callback，结束/中断/失败后清理。
  - [x] 保留有界 tail summary 与 diagnostic 的非空降级；证明 SQLite 最终 Agent 消息仍只写一次。
- [x] console-ui Markdown renderer
  - [x] 安装 Streamdown、直接安全依赖 `rehype-harden` 及 code、CJK、math、Mermaid 官方插件，配置 Tailwind v3 扫描和样式入口。
  - [x] 新增共享 `MarkdownMessage`，接入 static / streaming mode、现有设计令牌和安全 harden 配置。
  - [x] 用户与 Agent 历史正文统一接入；系统事实保持结构化纯文本。
  - [x] `RunBlock` 使用同一活动节点原地渲染 `liveMarkdown`，完成后与最终消息二选一显示。
  - [x] 覆盖 Markdown/GFM/CJK/Shiki/KaTeX/Mermaid、横向滚动、图片和交互控件测试与 stories。
- [x] Electron 外链安全
  - [x] console-ui 通过受控回调处理确认后的合法外链，未提供回调时不直接导航。
  - [x] preload/main 增加单用途外链 IPC，main 二次校验绝对 URL 与 `http/https/mailto` 协议后调用 `shell.openExternal`。
  - [x] 主 BrowserWindow 拒绝新窗口与外部 top-level navigation；补合法/非法 URL 和窗口边界测试。
- [x] 集成与验证
  - [x] 更新 desktop renderer 类型与 fake snapshot，保持一秒 refresh、滚动跟随和 selection gate 不变。
  - [x] 用固定八事件 driver fixture 与组件 rerender 流程验证只形成一个活动行和一个最终 Agent 消息。
  - [x] 构建 Storybook capability matrix，完成暗/亮主题、宽/窄窗口视觉走查与截图证据。
  - [x] 运行定向与全量测试、desktop/Storybook build、类型检查与 OpenSpec 结构校验。

验证说明：本 change 的定向测试、desktop 157 项测试、console-ui 187 项测试、根/desktop/console-ui 三层 typecheck、desktop build 与 Storybook build 通过；能力矩阵已留下亮色、暗色和窄窗截图。根 Vitest 以低并发重跑时 492/498 通过，6 项既有 local-console 用例在 5/10 秒时限下超时；本 change 新增的单条活动 run 原地替换与单次最终落库用例在该全量运行中通过。`pnpm exec openspec validate ... --strict` 因仓库未安装 `openspec` 命令无法执行，已按 `openspec/changes/AGENTS.md` 人工核对目录、Source 锚点与归档五步。
