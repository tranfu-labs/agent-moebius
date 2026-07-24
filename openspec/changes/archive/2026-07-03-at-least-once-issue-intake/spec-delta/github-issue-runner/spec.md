# github-issue-runner spec delta

## 核心不变量（新增）

- intake 游标 `updatedAt` MUST 只在 GitHub 上留下可见结果之后推进：要么本轮处理成功发布了 agent 评论（`triggered-success`）或确认无需触发（`no-trigger`），要么重试预算耗尽后成功发布了死信评论（`dead-lettered`）。任何处理失败 MUST NOT 推进 `updatedAt`。

## 修改

- 把「MUST 在 issue 出现 runner-relevant 变化并成功处理后把该 issue 提升为 active mode；若处理返回 `failed`，MUST 同样把该 issue 纳入或保持在 active backoff 窗口，直到后续成功处理、无变化降级或 failed 到达上限降级。」改为：「MUST 在 issue 出现 runner-relevant 变化并成功处理后把该 issue 提升为 active mode；若处理返回 `failed`，MUST 保持该 issue 在 active 窗口按 poll 节奏重试，直到后续成功处理，或失败达 `FAILURE_RETRY_LIMIT` 后死信发布成功（`dead-lettered`）降级。」
- 把「MUST 在 `no-trigger` 与 `failed` 后更新 intake state，避免未变化或持续失败的 issue 被每 tick 重复 fetch / process。」改为：「MUST 在 `no-trigger` 后推进 intake `updatedAt`；`failed` 后 MUST 更新 `failureCount` / `lastFailureReason` / `nextPollAt` 但 MUST NOT 推进 `updatedAt`，重试节奏由既有 poll / scan 间隔约束，MUST NOT 每 tick 刷屏。」
- 把「MUST 在单 issue 处理返回 `failed` 时把该 issue 的 `updatedAt` 同步为刚拉取的最新值、`activeNoChangeCount` 累加 1、`nextPollAt` 设为处理时间后 `activeIssuePollIntervalMs`；只有此前已处于 active mode 的 issue 才继承既有 `activeNoChangeCount`，此前处于 idle 或缺失状态的 failed MUST 从 1 开始计数；一旦累加到 `activeIssueNoChangeLimit`，MUST 立即把 `mode` 降为 `idle` 并把 `nextPollAt` 设为 `null`。」改为：「MUST 在单 issue 处理返回 `failed` 时保留既有 `updatedAt`、`failureCount` 累加 1（此前 idle 或缺失状态从 1 开始）、记录 `lastFailureReason`、`activeNoChangeCount` 保持不变、`mode = active`、`nextPollAt` 设为处理时间后 `activeIssuePollIntervalMs`。失败 MUST NOT 消耗安静降级预算（`activeNoChangeCount`），安静轮询 MUST NOT 消耗失败预算（`failureCount`）。」
- 把「MUST NOT 在 pre script 执行、Codex 执行或 GitHub comment 发布失败时推进 role-thread 状态或发布 GitHub 评论；失败时仅推进 intake `updatedAt` / `activeNoChangeCount` / `nextPollAt`，确保轮询能收敛降级。」改为：「MUST NOT 在 pre script 执行、Codex 执行或 GitHub comment 发布失败时推进 role-thread 状态；失败时仅更新 intake `failureCount` / `lastFailureReason` / `nextPollAt`，MUST NOT 推进 `updatedAt`，由重试预算与死信机制收敛。」
- 把「MUST 把非 issue-not-found 的 GitHub CLI 失败按 `classifyGhError` 分类处理：分类为 `transient` … 时按 `transient-failed` 结局折叠……分类为 `deterministic` … 时仍按 `failed` 规则推进……」改为：「MUST 把非 issue-not-found 的处理失败（含 GitHub CLI 失败、pre script 失败、Codex 失败、看门狗超时、thread 状态解析失败）统一折叠为携带失败原因的 `failed`，MUST NOT 在结局层按错误类型分类决定游标是否推进。`classifyGhError` 仅继续用于 gh 调用内同步重试的重试判定。」
- 把「……发布阶段（`processIssueSource` 主流程内）抛出的 GitHub CLI 失败 MUST 判为 `failed`（不重入、不重复发帖），瞬时软失败仅适用于尚未发布任何评论的拉取路径。」改为：「MUST 以『首条 GitHub 评论发布成功』为发布边界：边界之前的任何失败 MUST 折叠为 `failed`（不推进 `updatedAt`，重入安全）；边界之后的失败 MUST NOT 触发重入（避免重复发帖），按已发布收尾并记录日志。role-thread 状态 MUST 在首条评论发布成功之后才保存，保证重入时增量窗口一致。」

## 删除

- 「MUST 新增 `transient-failed` issue 处理结局并在 `recordIssueProcessingOutcome` 中折叠为：保留既有 `updatedAt`（不推进到最新）、`activeNoChangeCount` 不变、`mode = active`、`nextPollAt = processedAt + activeIssuePollIntervalMs`。」（`transient-failed` 结局被统一的 `failed` 语义取代）
- 「MUST 在拉取 issue（active poll / changed 处理路径）遇到非 issue-not-found 的 `transient` GitHub CLI 失败时，按 `transient-failed` 结局折叠而非 `failed`。」

## 新增

- MUST 在 intake issue 状态中维护可选字段 `failureCount`（缺省 0）与 `lastFailureReason`；`triggered-success` / `no-trigger` / `dead-lettered` MUST 清零这两个字段。存量状态文件（无新字段）MUST 可直接加载。
- MUST 在处理失败且折叠后 `failureCount` 将达到 `FAILURE_RETRY_LIMIT` 时，于同轮先完成本次真实处理尝试、确认仍失败后，向该 issue 发布死信评论；死信评论发布成功 MUST 折叠为 `dead-lettered`（推进 `updatedAt`、`mode = idle`、清零计数、`nextPollAt = null`），发布失败 MUST 保持 `failed` 并在后续轮次继续「先处理、后死信」。MUST NOT 在本轮处理成功时发布死信。
- MUST 让死信评论：以系统身份发布、不包含任何 agent mention、携带机器可识别标记 `<!-- moebius:dead-letter -->`，并包含目标 agent 名、`lastFailureReason`、累计失败次数与恢复提示（在 issue 发表任意新评论即可重新触发）。
- MUST 在死信评论被后续扫描读到时按 `no-trigger` 吸收，MUST NOT 形成自触发循环。
- MUST 记录结构化日志：失败重试 `event = "issue-retry-scheduled"`（含 `issueKey`、`failureCount`、失败原因），死信发布成功 `event = "dead-letter-posted"`，死信发布失败 `event = "dead-letter-post-failed"`。
- MUST 把 `FAILURE_RETRY_LIMIT` 写入启动日志 `CONFIG_LOG_FIELDS`。
- MUST 让 dev-workspace pre script 的 git 调用在失败时携带 stderr 摘要（如 `git failed with exit-code-128: fatal: unable to access ...`），使 `lastFailureReason` 与死信评论可定位根因。

## 场景新增

- 场景：pre script 瞬时失败不丢用户指令
  Given 用户在 issue 评论 `@dev 继续` 且 mention 触发成功
  And dev-workspace pre script 因 git 网络错误失败
  When runner 折叠该次处理结局为 `failed`
  Then 该 issue 的 `updatedAt` 保持原值（不推进）
  And `failureCount = 1`、`lastFailureReason` 含 git stderr 摘要
  And 下一轮 poll 重入处理；网络恢复后处理成功并正常回评
  And `failureCount` 与 `lastFailureReason` 被清零
- 场景：持续失败达预算后发布死信
  Given 某 issue 的 `failureCount = 4` 且 `FAILURE_RETRY_LIMIT = 5`
  And 本轮处理再次失败
  When runner 在同轮向该 issue 发布死信评论且发布成功
  Then 结局折叠为 `dead-lettered`：`updatedAt` 推进、`mode = idle`、计数清零
  And issue 上可见一条含失败原因与恢复提示的死信评论
  And 用户之后的任意新评论能重新触发处理
- 场景：死信发布失败不吞指令
  Given 某 issue 失败已达预算且本轮处理再次失败
  And 死信评论 `postComment` 抛出异常
  When runner 折叠该次处理结局
  Then 结局保持 `failed`，`updatedAt` 不推进
  And 后续轮次继续「先处理、后死信」，处理一旦成功则正常收敛且不发死信
- 场景：故障恢复后不误发死信
  Given 某 issue 因 GitHub 长时间故障 `failureCount` 已超过 `FAILURE_RETRY_LIMIT`
  And 故障已恢复
  When 下一轮到期先执行真实处理尝试且处理成功
  Then 结局为 `triggered-success`，正常发布 agent 评论
  And MUST NOT 发布死信评论，计数清零
