# 任务：harden-github-cli-transient-failures

- [ ] 新增 `src/retry.ts`：`classifyGhError` + `withRetry`（可注入 sleep、支持 signal、结构化重试日志）。
- [ ] `src/config.ts`：新增 `GITHUB_CLI_RETRY_POLICY` 与 `CODEX_RUN_MAX_DURATION_MS`，并写入 `CONFIG_LOG_FIELDS`。
- [ ] `src/github.ts`：抽出 `spawnCommand`，`runCommand` 经 `withRetry`；`postComment` 不重试；`fetchIssueWithComments` 支持 `signal`；导出 `isTransientGitHubCliError`。
- [ ] `src/github-response-intake.ts`：`IssueProcessingOutcome` 增 `transient-failed`，`recordIssueProcessingOutcome` 增软失败折叠分支。
- [ ] `src/runner.ts`：收尾中断检查 fail-open；job 拉取失败与外层 catch 的瞬时/业务失败分类；codex 看门狗；中断监视器 fetch 透传 signal。
- [ ] 单测：`tests/retry.test.ts`（分类三态、退避重试、确定性 bail、signal 取消、耗尽上抛）。
- [ ] 单测：`tests/github.test.ts` 增 `classifyGhError` / `isTransientGitHubCliError` 用例。
- [ ] 单测：`tests/github-response-intake.test.ts` 增 `transient-failed` 折叠用例（不烧计数、不推进 updatedAt、排下次 poll）。
- [ ] 单测：`tests/runner.test.ts` 增 收尾检查抛错 → fail-open 照常发布用例。
- [ ] AI 验证：`pnpm test` 与 `pnpm typecheck` 全绿。
