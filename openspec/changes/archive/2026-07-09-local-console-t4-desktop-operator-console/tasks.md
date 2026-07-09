# 任务：local-console-t4-desktop-operator-console

## A. 本地通道与 SQLite
- [x] 扩展 local console 类型：project/session summaries、run snapshot、`interrupted` / `stuck` message status、非空输出摘要、tail diagnostic。
- [x] 扩展 SQLite worker/store commands：创建/列出会话、更新会话标题/状态、记录 run startedAt/runDir、记录 interrupted/stuck，与 failed 分流。
- [x] 保持 T2 默认 `/api/local-console/messages` 兼容入口，新增 session-scoped state/message/interrupt API。
- [x] 补 local store/runtime 单元测试：多会话、重启后状态一致、interrupted/stuck/failed 分流、running lock 释放。

## B. 运行直播与中断
- [x] 在 local runtime 中维护 active run map 和 AbortController，支持按 session/runId 中断当前 Codex run。
- [x] 从 runDir 的 stdout.jsonl / stderr.log 有界读取尾流，限制 byte 窗口和读取 timeout；解析不到时降级为非空运行概括。
- [x] Codex 成功、失败、用户中断、timeout/stale-running 分别写回 agent/system/interrupted/stuck 本地记录，并保证后续消息可继续处理。
- [x] 补 fake Codex 集成测试：慢输出直播、中断释放、sessionId/runId 不匹配不误中断、非零退出/spawn error 本地错误记录、timeout/stale-running 卡住记录。

## C. Desktop 主窗口与 renderer
- [x] 让 Electron 主进程启动 local console server 并把 URL 暴露给 preload；桌面形态禁用 runner child 内部重复 local console server。
- [x] 新增 React renderer 构建，主窗口默认加载操作台；当前 status/observer 保留为辅助诊断入口。
- [x] preload 限定窄 API：local console URL/state 操作、诊断入口、打开 observer/data root、检查更新。
- [x] 补 desktop 纯模块测试与 build 验证。

## D. console-ui 展示组件
- [x] 新增纯展示组件：项目/会话侧栏、单时间线、agent 折叠消息、运行直播块、状态/错误记录、输入框。
- [x] 组件保持无 runner/IPC/GitHub/Codex/SQLite 依赖，只通过 props/callbacks 与 renderer 交互。
- [x] 为新组件补 Storybook 变体和单元测试：running、interrupted、stuck、failed、空输出 fallback、多会话切换。

## E. 验收与文档
- [x] 保存验收 artifact：运行直播截图/快照、中断后状态截图/SQLite 摘要、失败错误记录截图/SQLite 摘要；若需求持有者确认 QA 增补验收，再补卡住/有界尾流/跨会话中断截图或 API 摘要。
- [x] 运行 `pnpm test`、`pnpm typecheck`、console-ui 测试、desktop 测试和必要的 desktop build。
- [x] 将 T4 验收证据追记到 `docs/roadmap/milestone-4-local-console.md` 的 T4 下方并勾选 `[x]`。
- [x] 提交 commit（含 `Closes #103`）、push 当前分支，并创建 base `main` 的 PR，PR body 含 `Closes #103` 与验收证据摘要。
