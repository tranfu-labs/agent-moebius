# 设计：session-jsonl-fact-log

## 本 change 负责的验收落点

| 验收 | 落点（持久化字段 / 进程边界 / 模块） | 现状 |
| --- | --- | --- |
| adr-0004（配套规则整体） | 每会话 jsonl 追加层 + SQLite 可重建索引 + 迁移 marker | 不存在，消息只在 `session_messages` |

ADR-0004 无编号化验收，验收对照物是其「决策」与「配套规则」两节的每一条：唯一事实源、只追加、单写者、半行容忍、原子提交点、迁移不反向覆盖。

## 规则句绑定（拆分时全库扫描的落点，reflect 段以此核对）

- **「每会话 jsonl 是消息与会话事件的唯一事实源」**——要接管/镜像的全部现有消息产出点：
  - 表定义：`src/sqlite-state-worker.ts:308-329`（`session_messages`）。
  - worker 写入分支（16 个）：`local-append-user`(166)、`local-record-message-processed`(193)、`local-record-route-append`(197)、`local-record-route-no-action`(199)、`local-record-agent-response`(203)、`local-record-system-and-complete`(205)、`local-record-system`(207)、`local-record-failure`(209)、`local-record-retryable-failure`(211)、`local-record-dead-letter-and-complete`(213)、`local-record-interrupted`(215)、`local-record-stuck`(217)、`local-record-route-decision`(219)、`local-record-dead-letter`(221)、`local-record-workspace-diff`(223)、`local-record-child-session-card`(160)。
  - store 门面：`src/local-console/store.ts` 的 `appendUserMessage`(185)、`recordAgentResponse`(271)、`recordSystemMessage`(295)、`recordSystemAndComplete`(283)、`recordRouteAppend`(322)、`recordRouteNoAction`(335)、`recordMessageProcessed`(308)、`recordFailure`(352)、`recordRetryableFailure`(363)、`recordDeadLetter`(374)、`recordInterrupted`(386)、`recordStuck`(398)。
  - 调用点：`src/local-console/runtime.ts` 各 `store.record*`；HTTP 入口 `src/local-console/server.ts:505`（用户消息）、`:375`（子会话）。
  - 行号以拆分时工作区为准，实施时以最新 main 重新定位；覆盖以上全部产出点是「唯一事实源」成立的必要条件，漏一个就是审计违反项。
- **「只追加、不改写行」**——现状 SQLite 是原地更新模型（如 `recordAgentResponse` 更新同一行状态）；jsonl 层必须把状态推进表达为追加事件，SQLite 原地更新仅发生在「可重建缓存/可变状态」层。
- **「单写者」**——写链固定为 desktop 主进程 → runtime/store → jsonl；`src/codex.ts:196` 子进程写 `runDir/stdout.jsonl` 保持不变；已废弃的 `src/runner.ts`（终端 GitHub runner）不与桌面应用同时运行，不成为第二写者。
- **「可重建缓存，两边不一致以 jsonl 为准」**——可重建候选：`src/sqlite-state-worker.ts:560-604` sessions 视图对消息的聚合子查询（最后消息、状态点、created_at）、消息索引、派生表；必须保留的真可变状态：归档标记、未读、工作空间绑定、父子边（`session_edges`、`sessions` 列）。
- **半行容忍参照**：`src/codex.ts:125-176` 已有 jsonl 逐行解析对超长/半行的容忍实现，可作读取端参照。

## 方案

1. 文件布局参照 Codex CLI 形态：数据根下 `sessions/YYYY/MM/DD/<session-id>.jsonl`（或等价可稳定寻址布局），路径由 `src/config.ts` 派生；每行一个自描述事件（类型、时间、run/message 标识、载荷）。
2. store 层做单一漏斗：每个门面方法先追加 jsonl 行（fsync 策略明确），再走既有 SQLite 命令；jsonl 追加失败则整个操作失败，不产生只有索引没有事实的状态。
3. 迁移：启动时检测 marker，缺失则按会话从 `session_messages` 导出历史 jsonl，成功记 marker；旧表数据保留，读路径切到 jsonl 之后不允许旧表反向覆盖。
4. 重建：提供从 jsonl 重扫重建 SQLite 可重建部分的入口（内部命令即可，不要求界面）。
5. 稳定路径查询：store/runtime 暴露 `sessionId → 记录文件绝对路径` 的内部方法，供下游 change 用；不进任何展示字段。

## 权衡

- 双层一致性纪律（先日志后索引、重建、迁移）换取事实源单一与外部可读；实现与测试成本明确由本 change 承担。
- 每消息一次文件追加的 IO 成本，换单行原子提交点的简单崩溃语义；不引入批量缓冲以免复杂化提交点。

## 风险

- 迁移一次性脚本出错会生成错误历史：迁移后对每会话做行数/首末消息抽查比对，失败不写 marker、不切读路径，可回滚（旧表未删）。
- 写放大或 fsync 策略影响交互延迟：追加在主进程异步队列中串行执行，单写者天然无并发写。
- 外部工具误改文件：按 ADR 明确为如实呈现异常，不做修复承诺。
