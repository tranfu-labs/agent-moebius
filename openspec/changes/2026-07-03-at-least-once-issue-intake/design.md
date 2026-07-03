# 设计：at-least-once-issue-intake

## 方案

### 0. 全链路视角

变更消费链路：扫描（scanner）→ 派发（issue-dispatcher）→ 处理（runner 的 job / processIssueSource）→ 折叠（github-response-intake）→ 持久化（state-persister）。本次改动集中在"处理返回什么结局"与"折叠如何记账"两环，扫描与派发**不改**：

- 失败后 `updatedAt` 不推进，所以 5 分钟一次的 idle scan 会持续把该 issue 报为 changed，1 分钟一次的 active poll 也会到期重入，`dedupeIssueProcessingJobs` 保证同 tick 只派发一份——**自然重试节奏 ≈ 每分钟一次，无需新增退避调度**。全站 GitHub 故障时扫描本身也会失败，不产生额外空转。
- 崩溃语义免费获得：in-flight 结果随进程丢失后，重启靠 `updatedAt` 比对重新发现待处理工作（spec 既有条款），本次改动消除了 `failed` 提前推进游标这个唯一例外。

### 1. 结局与折叠（`src/github-response-intake.ts`）

- `IssueProcessingOutcome`：删除 `"transient-failed"`，新增 `"dead-lettered"`；`"failed"` 需要携带失败原因（结局从纯字符串联合升级为可携带 `reason` 的形态，具体表示交给实现，保持判等简单）。
- `IntakeIssueState` 新增两个**可选**字段：`failureCount?: number`（缺省视为 0）、`lastFailureReason?: string`。与 `activeNoChangeCount`（安静降级预算）分开，语义互不污染：失败不烧安静预算，安静不烧失败预算。
- `recordIssueProcessingOutcome` 折叠规则：
  - `failed`：**保留既有 `updatedAt`**（nack，核心改动）、`failureCount + 1`、写入 `lastFailureReason`、`activeNoChangeCount` 不变、`mode = active`、`nextPollAt = processedAt + activeIssuePollIntervalMs`。此前 idle 或缺失状态的失败从 `failureCount = 1` 开始。
  - `dead-lettered`：推进 `updatedAt` 到本轮拉取值（ack）、`mode = idle`、`failureCount` / `lastFailureReason` / `activeNoChangeCount` 全部清零、`nextPollAt = null`。
  - `triggered-success` / `no-trigger`：在现有规则上追加"清零 `failureCount` 与 `lastFailureReason`"。
  - `interrupted` / `issue-closed` / `issue-not-found`：维持现状（closed / not-found 直接移除状态，天然清账）。

### 2. runner 编排（`src/runner.ts`）

- **删除结局层分类**：`processActiveIssueJob` / `processChangedIssueJob` 的 catch 中去掉 `isTransientGitHubCliError` 分支，任何非 not-found 异常统一返回携带原因的 `failed`。`processIssueSource` 内部的显式失败出口（pre script 失败、codex 失败、看门狗超时、no-thread-id）同样把已有的日志 reason 附到结局上。
- **发布边界标志**：`processIssueSource` 主流程维护 `published` 标志，首条 `postComment` 成功后置真。外层 catch：`published === false` → 返回 `failed`（重入安全，此前对 issue 无任何评论写入）；`published === true` → 沿用现状按已发布收尾（记日志、不 nack），避免重复发帖。实现时核对并保证 role-thread 状态保存发生在首条评论成功之后，使 nack 重试时增量窗口（`lastSeenIndex`）不变、resume 提示词一致。
- **死信流程**：job 层在处理返回 `failed` 且折叠后的 `failureCount` 将达到 `FAILURE_RETRY_LIMIT` 时（job 已持有 previous 状态，changed 路径从 persister 读取），同轮调用 `postComment` 发死信评论：
  - 发送成功 → 该轮结局改判 `dead-lettered`；
  - 发送失败 → 保持 `failed`，计数继续增长，下轮"先处理、后死信"再来一遍——处理一旦成功即正常收敛，绝不会给已恢复的 issue 发死信。
- **死信评论内容**：复用现有 agent 评论格式化通道，身份为系统（不冒充 dev/ceo），必须**不含任何 agent mention**（避免自触发），带机器可识别标记 `<!-- agent-moebius:dead-letter -->`，正文包含：目标 agent 名、`lastFailureReason`、累计失败次数、恢复提示（"修复后在本 issue 发表任意新评论即可重新触发"）。死信评论本身会 bump issue `updatedAt`，下轮扫描按 no-trigger 吸收——与今天所有 bot 评论的自吸收路径一致，不新增机制。
- **结构化日志**：新增 `event = "issue-retry-scheduled"`（含 `issueKey`、`failureCount`、`reason`）、`"dead-letter-posted"`、`"dead-letter-post-failed"`。

### 3. 配置（`src/config.ts`）

- 新增 `FAILURE_RETRY_LIMIT = 5`，写入 `CONFIG_LOG_FIELDS`。按现有 poll 节奏，相当于持续失败约 5 分钟后尝试死信；gh 调用内 `withRetry` 已平滑亚分钟级抖动，5 分钟连续失败足以认定"不是抖动"。

### 4. 状态文件兼容（`src/github-intake-state.ts`）

- `isIntakeIssueState` 校验器接受缺失的 `failureCount` / `lastFailureReason`（可选字段），存量状态文件无需迁移即可加载；写出时带上新字段。

### 5. 错误信息质量（`src/agent-prescripts/dev-workspace.ts`）

- `runGit` 从 `stdio: ignore` 改为捕获 stderr，失败时把 stderr 摘要并入错误信息（如 `git failed with exit-code-128: fatal: unable to access ...`）。不在该层加重试——重试由 intake 层统一负责，该层只负责让 `lastFailureReason` 和死信评论可读、可定位。

### 6. 清理（`src/github.ts`）

- `isTransientGitHubCliError` 在 runner 侧不再使用；若无其他引用则删除导出。`classifyGhError` / `withRetry` 保留——它们是 gh 单次调用内的重试门（决定"这一次调用内要不要立即再试"），不是消费确认决策，与本次删除的结局层分类是两回事。

## 权衡

- **删除结局层错误分类，而非修正分类**：修正只覆盖已知错误类型，下一个没预料到的错误仍会走错分支；删除分类后正确性不依赖任何猜测。放弃的是"确定性错误（如认证失效）能立即降级不重试"——现在它们也会重试 `FAILURE_RETRY_LIMIT` 次才死信，多花约 5 分钟与几次无效调用，换来失败处理只有一条路径。
- **不做失败退避调度，复用现有 poll 节奏**：曾考虑指数退避（1/2/4/8/16 分钟），但 changed-scan 路径本就不受 `nextPollAt` 约束，退避形同虚设，还引入新调度逻辑；每分钟一次的重试对本系统的量级无压力，全站故障时扫描自身失败、天然静默。
- **死信前先做一次真实处理**：如果预算耗尽直接死信，GitHub 长时故障恢复后的第一轮会把本来能成功的指令误判死亡。代价是死信轮多一次处理尝试的开销，可忽略。
- **发布后失败不 nack**：重入会重跑 codex 并可能重复发帖（CEO append 双发路径风险，见 2026-07-02 change 的同一结论）。牺牲这一段的 at-least-once，换取绝不重复发帖；此时 issue 上已有部分可见产出，不属于"静默丢失"。exactly-once 发帖（评论幂等标记 + pending-publish 持久化）留作后续 change。
- **预算内重复 codex 运行的算力成本**：失败发生在 codex 之后、首条评论之前时，重试会重跑 codex。幂等机制（`lastSeenIndex` 增量、worktree 复用、成功才保存 role-thread 状态）保证正确性，代价是算力——用算力换"不丢指令"。

## 风险

- **死信评论自身的 exactly-once 缺口**：`postComment` 超时但服务端实际已写入时，下轮可能再发一条死信。概率低（写操作本就不自动重试）、后果轻（多一条重复通知），接受；根治并入后续 exactly-once change。
- **持续失败期间用户新评论的响应延迟**：failing issue 的重试节奏即响应节奏（约 1 分钟），无额外延迟风险。
- **死信永远发不出去**（token 失效等）：系统以 poll 节奏无限循环"处理失败 → 死信失败"，仅本地日志可见。这是外部依赖全断时的理论下界，任何方案都无法在 GitHub 上通知；靠日志与人工发现，显式接受。
- **回滚思路**：改动集中在折叠规则与 runner 结局出口，直接还原即可。状态文件双向兼容已核实：现行 `isIntakeIssueState` 只校验既有字段、不拒绝多余字段，回滚后旧代码可直接读含新字段的状态文件，无需清理。
