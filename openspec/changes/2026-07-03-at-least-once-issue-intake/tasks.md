# 任务：at-least-once-issue-intake

## 实现

- [ ] `src/github-response-intake.ts`：删除 `transient-failed`、新增 `dead-lettered`、`failed` 携带原因；`IntakeIssueState` 增加可选 `failureCount` / `lastFailureReason`；按设计改写 `recordIssueProcessingOutcome` 各分支折叠规则。
- [ ] `src/github-intake-state.ts`：校验器接受新可选字段；保存时写出新字段。
- [ ] `src/config.ts`：新增 `FAILURE_RETRY_LIMIT = 5` 并写入 `CONFIG_LOG_FIELDS`。
- [ ] `src/runner.ts`：job catch 去掉 `isTransientGitHubCliError` 分支，统一返回携带原因的 `failed`；`processIssueSource` 增加 `published` 发布边界标志并确认 role-thread 状态保存在首条评论成功之后；显式失败出口附带 reason。
- [ ] `src/runner.ts` / `src/issue-dispatcher.ts`：失败达 `FAILURE_RETRY_LIMIT` 时同轮尝试发死信评论，成功改判 `dead-lettered`、失败保持 `failed`；新增 `issue-retry-scheduled` / `dead-letter-posted` / `dead-letter-post-failed` 结构化日志。
- [ ] 死信评论格式化：系统身份、无 agent mention、`<!-- agent-moebius:dead-letter -->` 标记、含 agent 名 / 失败原因 / 失败次数 / 恢复提示。
- [ ] `src/agent-prescripts/dev-workspace.ts`：`runGit` 捕获 stderr 并入错误信息。
- [ ] `src/github.ts`：确认 `isTransientGitHubCliError` 无引用后删除导出（`classifyGhError` / `withRetry` 保留）。

## 测试（单元）

- [ ] `tests/github-response-intake.test.ts`：
  - `failed` 折叠：不推进 `updatedAt`、`failureCount` 从 0/既有值累加、`activeNoChangeCount` 不变、`mode = active`、`nextPollAt` 排下轮。
  - `dead-lettered` 折叠：推进 `updatedAt`、降级 idle、三个计数字段清零。
  - `triggered-success` / `no-trigger` 清零 `failureCount` 与 `lastFailureReason`。
  - 缺失新字段的旧状态对象按 `failureCount = 0` 处理。
- [ ] `tests/github-intake-state.test.ts`：不含新字段的存量状态文件可加载；含新字段的状态文件往返（保存→加载）保真。
- [ ] `tests/runner.test.ts`：
  - pre script 失败 → 结局 `failed` 且携带含 stderr 摘要的 reason，不发任何评论、不推进 role-thread。
  - 拉取失败（原 transient 类，如 EOF）→ 同样折叠为 `failed`，`updatedAt` 不推进，下轮重入后成功处理（模拟恢复）。
  - `failureCount` 达上限：本轮处理失败后发死信 → `postComment` 成功 → 结局 `dead-lettered`；`postComment` 抛错 → 结局保持 `failed`。
  - 死信轮处理成功 → 正常 `triggered-success`，不发死信。
  - `published = true` 之后抛异常 → 不返回 `failed`（不 nack），沿用已发布收尾。
- [ ] `tests/issue-dispatcher.test.ts`：`failed` / `dead-lettered` 结局经 `foldIssueProcessingJobResult` 正确落到状态。
- [ ] `tests/dev-workspace.test.ts`：`runGit` 失败时错误信息包含 stderr 内容。

## 验证（agent 手动走查）

- [ ] 本地跑 runner，对测试 issue 发 `@dev` 评论，临时破坏 repo cache（如改名目录）制造 pre script 失败：观察日志出现 `issue-retry-scheduled` 且 `updatedAt` 未推进；恢复 repo cache 后下一轮自动重入并正常回评——验证瞬时故障自愈。
- [ ] 保持破坏状态直到失败达 `FAILURE_RETRY_LIMIT`：观察 issue 上出现死信评论（含原因与恢复提示），状态文件中该 issue 降级 idle、计数清零、`updatedAt` 已推进——验证死信 ack。
- [ ] 死信后在 issue 发新评论：验证能重新触发。
- [ ] 死信评论落地后观察下一轮扫描：验证被 no-trigger 吸收，无自触发循环。

## 归档时

- [ ] 合并 spec-delta 到 `openspec/specs/github-issue-runner/spec.md`。
- [ ] 更新 `AGENTS.md`（若失败语义在其中有描述）。
