# github-issue-runner spec delta

## 修改
- 把「MUST 继续把非 issue-not-found 的 GitHub CLI 失败视作可恢复错误；若本轮没有成功取得 latest `updatedAt`，MUST 保留原 `updatedAt`，但仍按 `failed` 规则推进 `activeNoChangeCount` 与 `nextPollAt`，确保 fetch 失败也不会每 tick 刷屏。」改为：「MUST 把非 issue-not-found 的 GitHub CLI 失败按 `classifyGhError` 分类处理：分类为 `transient`（`EOF`、5xx、超时、连接错误、限流等）时按 `transient-failed` 结局折叠——保留原 `updatedAt`、MUST NOT 累加 `activeNoChangeCount`、保持 `mode = active` 并排下一次 poll，使长时间瞬时故障不降级、恢复后自然重入；分类为 `deterministic`（认证失败、参数非法等）时仍按 `failed` 规则推进 `activeNoChangeCount` 与 `nextPollAt` 以收敛降级。两类都 MUST NOT 每 tick 刷屏。」

## 新增
- MUST 对 `gh` CLI 调用提供调用内同步重试（指数退避），只重试 `classifyGhError` 判定为 `transient` 的错误；判定为 `deterministic` 的错误（issue 不存在、`HTTP 40x/422`、`Bad credentials`、`gh auth login`、`ENOENT` 等）MUST 立即上抛不重试。重试参数集中在 `src/config.ts` 的 `GITHUB_CLI_RETRY_POLICY`，每次重试 MUST 记录 `event = "gh-retry-attempt"`（含 `label`、`attempt`、错误原因）。
- MUST 让重试原语 `withRetry` 支持 `AbortSignal` 取消：signal 触发时停止后续重试与退避等待并上抛；MUST 允许注入无副作用 sleep，使重试逻辑可在不真实等待的情况下单元测试。
- MUST 让 `classifyGhError` 以 `gh` 命令 stderr / 错误消息为依据返回 `"transient" | "deterministic"`；未知的 `gh` 运行期失败默认 `transient`。
- MUST 对发表评论（写操作）默认不自动重试，避免瞬时错误引发重复评论；对幂等的 issue reaction 与只读拉取（issue 列表 / issue 详情）允许重试。发布阶段（`processIssueSource` 主流程内）抛出的 GitHub CLI 失败 MUST 判为 `failed`（不重入、不重复发帖），瞬时软失败仅适用于尚未发布任何评论的拉取路径。
- MUST 新增 `transient-failed` issue 处理结局并在 `recordIssueProcessingOutcome` 中折叠为：保留既有 `updatedAt`（不推进到最新）、`activeNoChangeCount` 不变、`mode = active`、`nextPollAt = processedAt + activeIssuePollIntervalMs`。
- MUST 在拉取 issue（active poll / changed 处理路径）遇到非 issue-not-found 的 `transient` GitHub CLI 失败时，按 `transient-failed` 结局折叠而非 `failed`。
- MUST 在收尾中断检查（codex 成功后的 conversation snapshot 复核）因 GitHub CLI 抛异常而失败时 fail-open：记录 `event = "agent-run-interrupt-check-failopen"`，视作未观察到新消息并照常执行后续发布流程，MUST NOT 因该次检查失败而丢弃已完成的 codex 产出或返回 `failed`。
- MUST 为单次本地 codex run 设置总时长看门狗上限 `CODEX_RUN_MAX_DURATION_MS`；超时 MUST 通过既有 `AbortController` 中止该 run，记录 `event = "codex-watchdog-timeout"` 并将该次处理判为 `failed`（区别于收到新消息的 `interrupted`），以兜底 in-flight job 永不返回导致的 `skip-inflight` 死锁。
- MUST 把 `GITHUB_CLI_RETRY_POLICY` 与 `CODEX_RUN_MAX_DURATION_MS` 写入启动日志 `CONFIG_LOG_FIELDS`。

## 场景新增
- 场景：收尾中断检查瞬时失败时 fail-open 照常发布
  Given `dev` agent 的 codex run 已成功产出最终文本
  And 收尾中断检查再次拉取 issue 时 GitHub CLI 因瞬时错误（如 `EOF`）在重试耗尽后仍抛异常
  When runner 处理该收尾检查异常
  Then 系统记录 `event = "agent-run-interrupt-check-failopen"`
  And 视作未观察到新消息，继续执行 CEO guardrail 与评论发布
  And MUST NOT 返回 `failed`、MUST NOT 丢弃已完成的 codex 产出
- 场景：瞬时 GitHub 故障不烧降级预算并在下一 tick 重入
  Given `tranfu-labs/moebius#4.mode = active` 且 `activeNoChangeCount = 3`
  And 一次 active poll 拉取该 issue 时遇到 `transient` GitHub CLI 失败且调用内重试耗尽
  When runner 折叠该次处理结局
  Then 该 issue 的 `activeNoChangeCount` 保持 3（不累加）
  And `updatedAt` 保持原值（不推进）
  And `mode` 保持 `active` 并排下一次 poll
  And 后续 poll 成功拉取到仍存在的变化时重新进入处理
- 场景：codex run 超时看门狗判 failed
  Given `dev` agent 的 codex run 运行时长超过 `CODEX_RUN_MAX_DURATION_MS`
  When 看门狗触发并通过 `AbortController` 中止该 run
  Then 系统记录 `event = "codex-watchdog-timeout"`
  And 该次处理判为 `failed`（而非 `interrupted`）
  And 该 issue 从 in-flight 集合释放，避免永久 `skip-inflight`
