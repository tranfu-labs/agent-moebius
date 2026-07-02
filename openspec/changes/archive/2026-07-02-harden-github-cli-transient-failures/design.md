# 设计：harden-github-cli-transient-failures

## 方案

### 1. 重试原语与错误分类（新增 `src/retry.ts`）
- `classifyGhError(error): "transient" | "deterministic"`：鸭子类型读取 `error.stderr`（`CommandFailedError`）或 `error.message`。
  - 命中确定性签名（`Could not resolve to an issue`、`HTTP 40x/422`、`Bad credentials`、`gh auth login`、`ENOENT`）→ `deterministic`。
  - 命中瞬时签名（`EOF`、`ECONNRESET/ETIMEDOUT/EAI_AGAIN`、`timeout`、`TLS handshake`、`HTTP 5xx`、`rate limit`、`temporarily unavailable`）→ `transient`。
  - 其余未知 `gh` 运行期失败默认 `transient`（重试有界，偏向可用性）。
- `withRetry(fn, options)`：指数退避循环。`options` 含 `retries/minTimeoutMs/maxTimeoutMs/factor`（缺省取 `GITHUB_CLI_RETRY_POLICY`）、`label`、`signal`、`shouldRetry`、可注入的 `sleep`（测试用无副作用 sleep，保证单测不真的等待）。每次重试打 `event = "gh-retry-attempt"` 结构化日志。`shouldRetry` 返回 false 或重试耗尽或 `signal` 取消 → 抛原始错误。

### 2. 重试落点（`src/github.ts`）
- 抽出 `spawnCommand`（原 `runCommand` 的 spawn 主体）；`runCommand(command, args, { stdin?, signal?, retry? })` 默认 `retry !== false` 时用 `withRetry` 包一层，`shouldRetry = classifyGhError(e) === "transient"`。
- `fetchIssueWithComments(source, { signal? }?)`、`listOpenIssueSummaries`、`addReaction` 走重试；`postComment` 传 `retry: false`（无幂等标记前不自动重发，避免重复评论）。
- 导出 `isTransientGitHubCliError(error)`（`CommandFailedError` 且分类为 `transient`），供 runner 判定软失败。

### 3. `transient-failed` 折叠（`src/github-response-intake.ts`）
- `IssueProcessingOutcome` 增加 `"transient-failed"`。
- `recordIssueProcessingOutcome` 增加分支：保留既有 `updatedAt`（不推进到最新）、`activeNoChangeCount` 不累加、`mode = active`、`nextPollAt = processedAt + activeIssuePollIntervalMs`。因为不推进 `updatedAt`，下一次成功拉取会重新看到变化并重入处理；因为不累加计数，瞬时故障不会把 issue 降级。

### 4. runner 编排（`src/runner.ts`）
- **收尾中断检查 fail-open**：`checkAgentRunInterrupt` 抛异常时记 `event = "agent-run-interrupt-check-failopen"` 并令 `finalInterrupt = null`（照常发布），不再 `return "failed"`。
- **失败分类**：
  - `processActiveIssueJob` / `processChangedIssueJob` 拉取失败（非 not-found）：`isTransientGitHubCliError` → 结局 `transient-failed`；否则 `failed`。这是用户实际遇到的故障路径，且此时尚未发布任何评论，重入安全。
  - `processIssueSource` 外层 catch：保持 `failed`。到达这里的失败几乎都在发布阶段（`postComment` 抛错；fetch 已在 job wrapper 处理、收尾检查已 fail-open），可能已部分发帖；若判 `transient-failed` 会触发下一 tick 重入并重跑 codex，在 CEO append 双发路径下会重复发帖。发布阶段的瞬时失败沿用现状（不重入、不重复发帖），exactly-once 发帖留待后续 change。业务失败的显式 `return "failed"`（prescript/codex/no-thread-id）保持不变。
- **codex 看门狗**：run 前 `setTimeout(CODEX_RUN_MAX_DURATION_MS)` 置 `watchdogFired = true` 并 `interruptController.abort("codex-run-timeout:…")`，`finally` 清定时器。中断结局解析时：`watchdogFired` → 记 `event = "codex-watchdog-timeout"` 返回 `failed`；否则 `interrupted`。
- 中断监视器 fetch 透传 `controller.signal`，外部中止时停止无谓重试。

### 5. 配置（`src/config.ts`）
- `GITHUB_CLI_RETRY_POLICY = { retries: 4, minTimeoutMs: 500, maxTimeoutMs: 8000, factor: 2 }`。
- `CODEX_RUN_MAX_DURATION_MS = 30 * 60 * 1000`（纯安全网，远高于正常 dev run）。
- 二者写入 `CONFIG_LOG_FIELDS`。

## 权衡
- **自研 `withRetry` 而非引入 p-retry**：本项目坚持零外部运行时依赖 + 纯函数可注入的风格，且当前环境的 pnpm store 版本不一致、拉取 p-retry 需联网。自研 `withRetry` 的 API 刻意对齐 p-retry（`retries/factor/minTimeout/maxTimeout/shouldRetry/signal`），可注入 `sleep` 让单测零等待；日后要换 p-retry 只是 `retry.ts` 内部的局部替换。放弃的是 p-retry 久经打磨的边角，换来零依赖、可控与可测。
- **`postComment` 不自动重试**：牺牲「发评论遇瞬时错误就地重试」的可用性，换取「绝不重复发帖」的正确性。真正的 exactly-once（评论去重标记 + pending-publish 持久化）留作后续 change；phase-1 的收益是不再丢产出、不再降级，长故障靠 tick 间重入收敛。
- **瞬时失败不烧降级预算**：极端长故障下 issue 会一直每分钟重试而不降级；这是刻意选择——整个 fleet 都连不上 GitHub 时不该「放弃」issue，恢复即收敛。

## 风险
- 收尾检查 fail-open 有极小概率发布一条「稍旧」评论（人类恰在收尾瞬间插话且拉取又失败）。运行中监视器已覆盖绝大多数中途插话，残余风险可接受，且用户已确认。
- 看门狗时长设置过短会误杀长 dev run；设 30 分钟纯兜底。回滚思路：`transient-failed` 与 `failed` 分类若判错，只影响降级节奏而非数据；整体可通过恢复 `runCommand` 直连、去掉 `transient-failed` 分支回退。
