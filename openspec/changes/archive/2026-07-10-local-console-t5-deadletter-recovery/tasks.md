# 任务：local-console-t5-deadletter-recovery

- [x] OpenSpec 与基线
  - [x] 保持本 change 范围只覆盖 local-console dead-letter/recovery，不修改 GitHub runner 语义。
  - [x] 运行 `pnpm exec openspec validate local-console-t5-deadletter-recovery --strict` 并保持退出码 0。

- [x] SQLite / store
  - [x] 为 local source message 增加 failure count / last failure reason 持久化，按 `(session_id, message_id)` 幂等。
  - [x] 新增原子 store command：预算内记录 retryable failure 并释放 message。
  - [x] 新增原子 store command：写 visible dead-letter system record、写 `local_dead_letters` fact、完成 source message。
  - [x] 保证 visible dead-letter 写失败时事务回滚，不推进 cursor、不保存 successful dead-letter outcome。
  - [x] 保证 dead-letter system record 不含合法 agent mention。

- [x] Runtime 接入
  - [x] 在 route retry/throw、workspace failure、Codex non-timeout failure、recordAgentResponse failure、workspace diff failure 路径接入失败预算。
  - [x] 保留 user interrupt 为 interrupted，保留 Codex idle/max-duration timeout 与 stale repair 为 stuck。
  - [x] 达到预算后停止重复处理同一 source message，后续 process/poll 不重复写 dead-letter。
  - [x] 同 session 追加新消息后可继续处理，不重放已 dead-letter source message。

- [x] 重启恢复
  - [x] `repairStaleRunning()` 只修复真正 stale running 的 source message，不影响已完成 agent response。
  - [x] startup catch-up 不重复写已完成 agent response。
  - [x] startup catch-up 能从未 claim 的下一棒或新消息继续处理。
  - [x] 旧 SQLite fixture 或缺失 failure metadata 时完成默认值迁移，不丢 pending/running 位点。

- [x] 测试与验收
  - [x] 更新 `tests/local-console.test.ts` 覆盖失败预算、dead-letter 防重、visible write failure、recordAgentResponse 连续失败上限。
  - [x] 更新 `scripts/acceptance/local-console-t5.ts --case dead-letter-recovery`，通过 fake runtime 验证连续失败到 dead-letter、后续不重复刷、新消息恢复。
  - [x] 新增 `scripts/acceptance/local-console-t5.ts --case restart-stuck-recovery`。
  - [x] 新增 `scripts/acceptance/local-console-t5.ts --case record-response-dead-letter`。
  - [x] 保持 `scripts/acceptance/local-console-t5.ts --case dead-letter-write-failure-s1-v1` 覆盖 cursor 不推进与 outcome 不保存。
  - [x] 新增 `scripts/acceptance/local-console-t5.ts --case legacy-failure-metadata-recovery`。
  - [x] 新增 `scripts/acceptance/local-console-t5.ts --case dead-letter-no-mention`。
  - [x] 运行 `pnpm test -- --run tests/local-console.test.ts`、相关 T5 acceptance case 与 `pnpm typecheck`。
