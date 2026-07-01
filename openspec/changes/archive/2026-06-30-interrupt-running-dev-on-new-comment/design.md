# 设计：interrupt-running-dev-on-new-comment

## 方案
新增一个通用 conversation interrupt helper：

- 输入 baseline snapshot（当前 messageCount）与 driver 提供的 `fetchSnapshot()`。
- 周期性拉取 current snapshot。
- 当 `current.messageCount > baseline.messageCount` 时产生 `new-message` interrupt，并通过回调触发 `AbortController.abort()`。

`runner.ts` 在选中 agent 且即将调用 Codex 时建立中断 monitor。当前只对 `dev` role 启用；GitHub adapter 通过 `fetchIssueWithComments(source)` 生成 `{ messageCount: 1 + comments.length }` 快照。后续其他 driver 可以用同样的 monitor，只替换 `fetchSnapshot()`。

`codex.ts` 增加 `signal?: AbortSignal`：

- signal 已 abort：直接返回 interrupted 失败。
- signal 在子进程运行中 abort：先向 Codex 子进程发送 `SIGINT`，短暂等待后兜底 `SIGTERM`。
- 被中断的 run 统一返回 `ok: false` 与 `reason = interrupted:<detail>`，即使子进程退出码为 0 也不解析最终消息，避免发布过时内容。

`github-response-intake.ts` 增加 `interrupted` outcome：

- 不把 latest GitHub updatedAt 当作成功处理完成来推进到新 comment。
- 记录当前已开始处理的 baseline updatedAt，并保持 issue active。
- 设置 `nextPollAt` 为当前处理时间，使 runner 可以尽快重新取最新 timeline。

## 权衡
- 不取消全局 `running` 串行 tick 保护。这样避免同时写 intake state / role thread state 的竞态；中断由 agent run 内部 monitor 完成。
- 使用 messageCount 判断新 comment，而不是 GitHub `updatedAt`。这能避免 label/title/body 等非新增 comment 更新误杀正在运行的 Codex。
- 先只启用 `dev` role，贴合本次需求；monitor 本身保持 role/driver 无关，后续扩大到其他 role 不需要改 Codex 层。

## 风险
- Codex 如果忽略 `SIGINT`，会在兜底延迟后收到 `SIGTERM`；极端情况下仍可能需要操作系统回收。
- 轮询间隔越短越及时，但 GitHub CLI 调用越多；本次使用专门的运行中断轮询间隔并集中在 running agent 期间。
