# 提案：add-trigger-self-reflection

## 背景
`processIssueSource` 单轮只调用一次 `resolveTrigger`：

- 当 latest message 是 `@dev` 这类 mention 时，本轮命中 mention trigger 并跑 codex，把 `<dev>` 含 `plan-written` stage marker 的评论 post 回 issue。
- 该函数到此即返回，本轮不会再次解析 trigger。

dev 自己刚 post 的 stage 评论要等下一轮 `pollActiveIssue`（active mode 默认 1 分钟一次）拉到 `updatedAt` 变化后才会再触发 `resolveTrigger`，那一次才会命中 reflector stage trigger 发出 hook 评论。

延迟最少 1 个 tick；若 runner 进程在这之间退出（手动 Ctrl-C、崩溃、被外部一次性触发模式启动），reflector hook 永远不会出现。issue #54 的实际表现即为此：dev 在 `09:59:09Z` 写出 plan-written 评论后，本机 runner 没有走到下一轮 tick，hook 始终未触发。

## 提案
在 `processIssueSource` 的 mention-codex 分支 `postComment` 完成之后插入一个**同轮自反循环**：

- 把刚 post 的评论拼回本地 timeline。
- 再次调用 `resolveTrigger`。
- 命中 reflector stage hook（`kind === "post-comment"`）就当场 `postComment(hook.body)`、继续拼回 timeline、继续 resolve；命中 mention（需要再跑 codex）就停止本轮自反，留给下一轮 `pollActiveIssue`；返回 skip 也停止。
- 上限 `MAX_SELF_REFLECT = 3`，防止 trigger 链路出现意外循环时无限串。

兜底机制完全保留：`TICK_INTERVAL_MS`、`ACTIVE_ISSUE_POLL_INTERVAL_MS` 不动；自反失败或外部 actor 写带 stage marker 的评论仍由下一轮 active poll 兜底。

## 影响
- `src/runner.ts` `processIssueSource` 在 mention-codex 分支末尾新增自反循环。
- 新增 `src/triggers/self-reflect.ts`，导出两个纯函数（本地 timeline 拼接、自反步骤决策）。
- `src/config.ts` 新增 `MAX_SELF_REFLECT` 常量并写入 `CONFIG_LOG_FIELDS`。
- 单元测试覆盖：本地 timeline 拼接、自反步骤决策的 4 个分支、拼接后命中 reflector stage trigger 的端到端纯函数测试。
- `openspec/specs/github-issue-runner/spec.md` 新增 trigger 自反时机的业务规则、3 个场景与对应可验证行为条目。
- 项目级归档约定升级：`openspec/changes/AGENTS.md` 增补「架构图回流」第 4 步，新约束只对带 `architecture/after.svg` 的 change 生效，存量 change 不受影响。
- 不改变 stage hook 去重规则、stage marker / stage-hook metadata 格式、role thread 状态读写、active poll 节奏与上限。
