# 提案：local-console-t5-deadletter-recovery

## 背景
T5 基础方案与本地交棒总线已经进入 `main`：`src/local-console/t5-store.ts` 提供本地 T5 facts 写入入口，`src/local-console/route-bus.ts` 已把本地 no-mention route append 做成可见消息 + 下一轮 drain 触发的两步语义。

本子任务只补齐 T5 的异常收敛切片：本地运行失败、连续失败、timeout stuck 与重启 catch-up 必须有 visible dead-letter / stuck / recovery 留痕，并且不能在同一坏消息上无限重跑或重启后重复写已完成响应。

## 提案
新增 `local-console-t5-deadletter-recovery` 实现切片，范围限定在 local-console runtime / SQLite / acceptance script：

1. **本地失败预算**：给每条 local source message 的处理失败维护 `failureCount` 与 `lastFailureReason`；失败未达到预算时释放为 retryable，达到预算才进入 dead-letter。
2. **visible dead-letter 原子写**：dead-letter 必须同时写入可见 system message 与 `local_dead_letters` fact，并完成源消息；可见写失败时不得推进 cursor 或保存 successful dead-letter outcome。
3. **timeout/stale recovery 幂等**：Codex idle/max-duration timeout 和 stale running repair 继续归类为 stuck，但重启 catch-up 必须释放 session 位点；已经落库的 agent response 不重复写入，未 claim 的下一棒可由 startup catch-up 继续。
4. **验收脚本升级**：把 `scripts/acceptance/local-console-t5.ts --case dead-letter-recovery` 从直接写 fact 的 smoke case 升级为通过 fake runtime/store 注入连续失败、dead-letter、重启 catch-up 和不重复消费的真实验收。

本 change 承接 `local-console-t5-full-parity` 的本地 T5 总体边界，但不实现子会话编排、验收 pre-pass、worktree diff 回流或 console-ui 新视图。

## 影响
受影响模块：

- `src/local-console/runtime.ts`：统一处理 Codex failure、workspace/route/store failure、recordAgentResponse failure 的 retry/dead-letter 预算；保留 interrupted 与 stuck 的特殊分流。
- `src/local-console/store.ts`、`src/local-console/types.ts`、`src/sqlite-state.ts`、`src/sqlite-state-worker.ts`：扩展 local message failure metadata、dead-letter 原子事务与 stale recovery 查询/写入。
- `src/local-console/t5-store.ts`：复用 `recordLocalDeadLetter` / `listLocalT5Facts`，必要时补充 runtime-facing helper，避免业务代码直接拼 SQLite。
- `tests/local-console.test.ts`：新增失败预算、visible dead-letter 写失败、recordAgentResponse 连续失败、stale restart catch-up 幂等单元测试。
- `scripts/acceptance/local-console-t5.ts`：升级 `dead-letter-recovery` 与 `dead-letter-write-failure-s1-v1` case，产出 `artifacts/acceptance/t5-evidence.json` 中可由 PM 验收的证据。
- `openspec/changes/local-console-t5-deadletter-recovery/specs/local-console/spec.md`：记录本切片的本地 dead-letter / recovery 行为 delta。

对外行为：

- 本地操作台中，同一条坏消息连续处理失败达到预算后只出现一条 visible dead-letter，不继续刷同一失败。
- dead-letter system record 不含合法 agent mention，不会自触发。
- 用户在同 session 追加新消息后，session 能继续处理新消息，不重放已 dead-letter 的旧消息。
- timeout/stale 重启后 session 不会永久 running；已完成 agent response 不重复写入，剩余 pending/handoff 可继续 catch-up。

## 验收语句
以下清单包含本 issue 原始两条验收目标，以及 product-manager 已在 issue 时间线明确接受的 QA 4 条增补。原始两条仅细化为可机械执行命令；细化理由是原句“模拟”需要绑定到本地 T5 acceptance case 才能稳定复验。

1. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-recovery` → 应输出同一 local message 连续失败达到预算后写入一条 visible dead-letter 与一条 `local_dead_letters` fact，后续轮询不重复写同一失败。
2. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case restart-stuck-recovery` → 应输出 timeout/stale running 后重启 local console server 会释放或恢复 session 位点，已完成 agent response 不重复写入，未完成下一棒可继续处理。
3. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case record-response-dead-letter` → 应输出注入 `recordAgentResponse` 提交前连续失败直到本地重试上限后，只写入一条 visible dead-letter 与一条 `local_dead_letters` fact，不重复写 agent response，后续新消息仍可处理。
4. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-write-failure-s1-v1` → 应输出 dead-letter visible system record 写入失败时不推进 cursor、不保存 successful dead-letter outcome、不写 `local_dead_letters` fact，SQLite 恢复后同一 source message 可再次尝试写 visible dead-letter。
5. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case legacy-failure-metadata-recovery` → 应输出旧 SQLite fixture 或缺失 failure metadata 的 running/pending 状态启动后完成幂等迁移或默认值补齐，stale running 被释放或记录 stuck，已完成 agent response 不重复写入。
6. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-no-mention` → 应输出 dead-letter reason/body 中即使包含类似交棒文本，visible dead-letter 也不包含合法 agent mention，后续 drain 不因该 dead-letter 自触发 agent run。

## 实现验证命令
实现阶段还必须补充下面的开发侧验证，但它们不新增正式验收范围：

- 跑 `pnpm test -- --run tests/local-console.test.ts` → 应退出码 0，并覆盖失败预算、dead-letter 防重、stale restart catch-up 幂等与 recordAgentResponse 连续失败上限。
