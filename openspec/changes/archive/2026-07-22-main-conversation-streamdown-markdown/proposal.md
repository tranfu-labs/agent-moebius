# 提案：main-conversation-streamdown-markdown

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 时间线、运行中的操作条 | 用户与 Agent 正文统一使用安全 Markdown；运行中按同一条临时记录原地更新 | 已写入 |
| `docs/product/pages/main-conversation.md` | 指标与验收 | 增加语法覆盖、消息不膨胀和桌面外链安全判据 | 已写入 |

## 背景

主会话当前把用户与 Agent 正文当作 `whitespace-pre-wrap` 纯文本。标题、列表、表格、代码块、公式和 Mermaid 都只显示源码；运行中的 `RunBlock` 又只拿 `stdout.jsonl` 最近一条递归文本摘要，无法呈现 Agent 正在给用户看的完整 Markdown。

真实运行也说明“流式事件”不能直接等同于“时间线消息”。当前 `codex-cli 0.144.1 --json` 的一次只读检查共产生 `thread.started`、`turn.started`、两条 `agent_message`、一次命令开始、一次命令完成和 `turn.completed` 等八条事件，但对话语义仍只有一条用户消息和一条最终 Agent 回复。若把 JSONL 事件逐条塞进时间线，会把运行协议误当聊天记录；若只保留最后一行摘要，又失去实时可读性。

Streamdown 已提供面向 AI 输出的 Markdown、未闭合块处理、GFM、安全清洗和可选的代码、CJK、数学、Mermaid 插件。需要把它接到现有“单条运行记录原地更新”的产品模型上，而不是另造消息流或任务日志。

## 提案

1. 新增 `console-ui` 共享 Markdown 消息组件。用户与 Agent 已完成正文用 Streamdown 静态模式，活动 run 用流式模式；系统事实继续走现有结构化组件。
2. 启用 Streamdown 内建 Markdown/GFM，并接入 `@streamdown/code`、`@streamdown/cjk`、`@streamdown/math`、`@streamdown/mermaid`。保留适用的复制、下载与 Mermaid 全屏控件，样式服从现有 console-ui 令牌。
3. 在 Codex driver stdout 链上增加可选、只读的 Agent 可见文本回调；JSONL framing 与 event schema 留在 driver 内部。local runtime 只消费完整 `agent_message` 文本，并在 `ActiveLocalRun` 中只保存当前最新一段 `liveMarkdown`；命令、reasoning、诊断和生命周期事件不成为消息。
4. 现有一秒 state snapshot 增加 `activeRun.liveMarkdown`。同一 `runId` 始终渲染同一条活动记录，后续 Agent 可见段原地替换；运行完成后活动记录消失，由现有事务落库的一条最终 Agent 消息接管。活动 Markdown 不写 SQLite，不改变会话消息数量、cursor 或恢复语义。
5. 不伪造 token 流。当前 CLI 没有提供 token delta 时按完整 Agent 进度段更新；适配层保留未来接入 delta 的边界，但不猜测未知事件格式。
6. 收紧 Streamdown 的默认宽松 URL 配置：HTML 先 sanitize；链接只允许 `http`、`https`、`mailto`，图片只允许 `http`、`https`，禁用 data image、本地文件与自定义协议，Mermaid 使用 strict security。
7. 外链确认后通过 `console-ui` 回调进入 desktop preload 窄 IPC，由主进程再次校验协议并调用 `shell.openExternal`；主窗口拒绝 Markdown 触发的直接导航或新窗口。

## 影响

- `src/codex.ts`：有界完整 JSONL 行 framing、可见 Agent Markdown 事件提取和可选文本回调；最终文本提取保持不变。
- `src/local-console/runtime.ts`、`src/local-console/types.ts`：活动 run 缓存与 snapshot 增加 `liveMarkdown`，不新增持久化字段。
- `src/local-console/output-tail.ts`：保留有界 tail 摘要作为无可见 Agent Markdown 时的降级，不再把任意命令输出冒充 Markdown 正文。
- `packages/console-ui`：引入 Streamdown 及四个官方插件，新增共享 renderer，改造时间线与活动 run，补齐样式、Storybook 和组件测试。
- `desktop/src/console-page/app.tsx`：传递活动 Markdown 与安全外链回调；现有一秒轮询、选择协调和滚动跟随不变。
- `desktop/src/preload.ts`、`desktop/src/main.ts`：新增单用途外链 IPC、协议复验和窗口导航拦截。
- OpenSpec 域：`local-console`、`console-ui`、`desktop-shell`。

协调边界：

- 活跃 change `local-console-primary-agent-closeout` 正在调整主 Agent 收尾、stage 缺席降级与同一主时间线事实。本 change 不改变路由或完成判定，只在其最终消息行与活动 run 行内部渲染正文。
- 既有 `console-message-run-humanization` 的角色、stage、结论与交棒摘要仍可保留；凡展示完整 Markdown 正文的出口统一复用新组件，不能再以 `<pre>` 或纯文本复制第二套 renderer。
- GitHub issue 评论发布、observer 和 GitHub runner 不改；本次只覆盖桌面本地会话。
