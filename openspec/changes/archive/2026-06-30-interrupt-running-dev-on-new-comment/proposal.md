# 提案：interrupt-running-dev-on-new-comment

## 背景
当前 runner 在一次 tick 中会等待 Codex 执行完成；如果 `@dev` 正在长时间执行，期间 GitHub issue 又出现新 comment，runner 只能等本轮结束后才看到新消息。这会让已经过时的 Codex 回复继续执行并可能发回 issue。

## 提案
- 为本地 agent run 增加可中断执行能力：当源 conversation 在运行期间出现新消息时，中断正在执行的 `@dev` Codex 进程。
- 将中断检测抽象为 driver-agnostic 的 conversation snapshot 轮询器；GitHub driver 只提供当前消息数快照，后续其他 driver 可复用同一接口。
- Codex 被中断后不得发表评论、不得更新 role thread 状态；intake 状态应让该 issue 保持 active，并尽快基于最新 timeline 重新处理。

## 影响
- 受影响模块：`src/runner.ts`、`src/codex.ts`、`src/github-response-intake.ts`、新增 conversation interrupt helper。
- 受影响规格域：`github-issue-runner`。
- 对外行为：`@dev` 长时间运行时，新 comment 会打断旧 run，下一轮处理包含新 comment 的最新共享时间线。
