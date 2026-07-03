# 提案：at-least-once-issue-intake

## 背景

2026-07-03 发生一次用户指令静默丢失事故：用户在 `tranfu-labs/tranfu-agents-app#94` 评论「@dev 继续」（09:24:42Z），mention 触发成功（消耗了 r55 运行序号），但运行在启动 codex 之前失败（最可能是 dev-workspace pre script 的 git 网络抖动），结局被判为 `failed`。按现行折叠规则，`failed` 会把 intake 游标 `updatedAt` 推进到最新值——相当于把这条尚未处理的用户指令确认消费掉了。此后 issue 按无变化轮询降级 idle，系统再也不会为这条评论重试，用户看到的现象是"agent 没有任何反应"。

根因不是某一次分类错误，而是失败处理的结构性缺陷：

1. **游标推进与处理成败解耦**。`failed` 分支推进 `updatedAt`，等于"处理失败但确认消费"，把 at-least-once 语义降级成 at-most-once。
2. **依赖启发式错误分类**。现行设计靠 `classifyGhError` / `isTransientGitHubCliError` 区分瞬时与确定性失败来决定是否保留游标；分类是猜测，猜错一次（如本次 pre script 的 git 失败根本不经过该分类器，直接落入 `failed`）就静默丢指令。健壮性不应依赖"每种错误都被正确分类"。
3. **放弃时不通知**。重试预算（现为降级预算）耗尽后 issue 静默降级，GitHub 上没有任何可见痕迹，用户只能事后翻终端日志考古。

## 提案

把 issue intake 的失败语义统一为「**at-least-once + 幂等 + 可见死信**」，核心不变量一句话：

> **intake 游标 `updatedAt` 只有在 GitHub 上留下可见结果之后才推进——要么是正常的 agent 评论，要么是死信评论。**

具体：

1. **统一失败路径，删除结局层的错误分类**。取消 `transient-failed` 结局与 runner 层的 `isTransientGitHubCliError` 判定；任何处理失败（拉取、pre script、媒体准备、codex 运行、thread 状态解析）一律折叠为携带原因的 `failed`：不推进 `updatedAt`、失败计数 `failureCount + 1`、记录 `lastFailureReason`、保持 `mode = active` 排下一次 poll。瞬时故障靠自然重试恢复，无需分类。
2. **失败重试预算 + 死信**。每次到期先照常尝试处理（保证故障恢复后能正常收敛而不是误发死信）；处理仍失败且 `failureCount` 已达 `FAILURE_RETRY_LIMIT` 时，同轮向 issue 发一条死信评论（含 agent 名、失败原因、重试次数、恢复提示）；死信**发送成功**才折叠为新结局 `dead-lettered`——推进 `updatedAt`、降级 idle、清零计数。死信发送失败则继续按 `failed` 循环，下轮先处理后死信。
3. **发布边界维持结构性保护**。首条 GitHub 评论发布成功之后发生的异常不再 nack 重入（避免重复发帖），沿用现状按已发布收尾；这是按"流水线位置"划的确定性边界，不是按错误类型猜的启发式边界。exactly-once 发帖仍留作后续 change。
4. **保留 gh 调用内重试**（`retry.ts` / `withRetry`）：那是单次调用内的快速平滑，与 intake 层的慢速重入互补，二者职责不同，互不替代。

## 影响

- **业务域**：`github-issue-runner`（intake 状态机、失败折叠、runner 编排）。
- **模块**：`src/github-response-intake.ts`、`src/runner.ts`、`src/issue-dispatcher.ts`、`src/github-intake-state.ts`、`src/config.ts`、`src/agent-prescripts/dev-workspace.ts`、`src/github.ts`。
- **对外行为变化**：
  - 处理失败的 issue 不再被静默消费，会以现有 poll 节奏（约每分钟）自动重试；持续失败约 `FAILURE_RETRY_LIMIT` 次后，issue 上会出现一条死信评论。
  - 崩溃安全性增强的副产品：进程在处理中途被杀，重启后靠 `updatedAt` 比对自动重入（与 spec 既有崩溃语义一致，且不再有 `failed` 提前推进游标的例外）。
  - 状态文件 `.state/github-response-intake.json` 新增可选字段 `failureCount` / `lastFailureReason`，向后兼容，无需迁移。
- **取代**：部分取代 `2026-07-02-harden-github-cli-transient-failures` 引入的 `transient-failed` 结局及其 runner 层分类（该 change 的 gh 调用内重试、fail-open 收尾检查、看门狗均保留）。
