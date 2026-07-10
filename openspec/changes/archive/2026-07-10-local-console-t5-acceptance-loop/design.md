# 设计：local-console-t5-acceptance-loop

## 方案
### 1. qa → PM → 实现 → 落地的工作顺序

本 change 按 issue 指定四步推进：

1. `plan-written` 后交 qa 做方案测试设计审查。
2. qa 通过后进入实现；实现阶段先补 parser 与纯逻辑单测，再接 runtime / SQLite 事务。
3. `code-verified` 后由 CEO guardrail 回流 product-manager / hermes-user 类需求验收；本 change 的本地逻辑也要支持这些角色消息被 runtime 解析。
4. 完成后归档 OpenSpec、更新 roadmap 证据、commit、push，并创建 base main 的 PR，PR body 使用 `Closes #112`。

### 2. 验收走查 parser

新增 `src/local-console/acceptance-loop.ts`，导出纯函数：

- `parseLocalAcceptanceWalkthrough(body, acceptanceStatements)`：返回 `parsed` 或 `unparsed`。
- `buildLocalAcceptanceReminder(role, expectedCount, diagnostics)`：生成不含合法 agent mention 的 visible reminder 文案。
- `decideLocalAcceptanceOutcome(parsed)`：把逐条结果折叠为 `passed` / `failed`，并校验总状态一致。

解析规则：

- 逐条行只接受 `N. 通过 — 依据` 或 `N. 不通过 — 依据`；破折号允许 ASCII `-` 作为输入兼容，但输出提醒使用协议中的 `—`。
- 编号必须从 1 开始连续，数量必须等于 formal acceptance statements 数量。
- `验收结论：通过/不通过` 必须独立一行。
- 任一逐条不通过时，总结论必须是不通过；全部逐条通过时，总结论必须是通过。
- parser 不读取 GitHub，不写 SQLite，不依赖 runtime，方便单测覆盖。

### 3. Runtime acceptance pre-pass

在 `LocalConsoleRuntime.processPending()` claim 到下一条 `session_messages` 后、调用 `resolveTrigger()` 前执行：

1. 若 message 不是 `speaker='agent'` 或 role 不在 `qa` / `product-manager` / `hermes-user`，直接返回 `not-applicable`。
2. 根据 session relation 与本地 T5 facts 取得 formal acceptance statements：
   - child session：从 child initial body 的 `Acceptance statements:` 区块或后续 local ledger projection 读取。
   - parent integration session：从 local integration event detail 或 parent goal projection 读取。
   - 暂时缺少 projection 时，返回 blocked system message，避免伪造验收范围。
3. 解析通过：
   - 写 `local_acceptance_facts`，evidence JSON 包含 role、messageId、statementResults、rawConclusion、sourceBodyDigest。
   - 全部通过时，写 parent integration request / completed event，并在父会话追加 visible system progress。
   - 任一不通过时，写 failed fact，并用稳定 repair key 创建/找回 repair child session 或向当前 session 写 visible dev handoff system record。
4. 解析失败且正文含 `验收结论：通过` 或明显验收意图：
   - 写 visible format reminder / local error state。
   - 不保存 passed acceptance fact。
   - 不消费同消息中的普通 handoff mention。

pre-pass 返回 `handled` 后才推进 message cursor；可见写失败必须抛出，让现有 retry 机制保留 active/pending 状态。

### 3a. 事实源边界替换

当前 `openspec/specs/local-console/spec.md` 的「边界」仍包含预 T5 禁止条款：不得实现 T5-only full acceptance pre-pass。#112 实现前必须让本 change 的 delta 明确替换该条款：

- 归档后 `local-console` 允许本地 acceptance-loop 这个窄切片：解析验收角色走查、记录 local acceptance fact、驱动 parent integration / repair、格式错误可见诊断。
- 归档后仍禁止为了本切片修改 GitHub issue runner 语义、`conversation` / `triggers` 解析规则、GitHub CEO 编排、observer、release artifact、issue worktree 和 T6 GitHub/local 互斥启动 flag。
- 本 change 不承担 #110 总方案中的所有 T5 parity；CEO no-mention 兜底、完整 child orchestration、dead-letter 全量 parity、artifact publishing local equivalent 和 worktree diff return 仍按各自子任务推进。

实现前的静态准入检查：`openspec validate local-console-t5-acceptance-loop --strict` 必须通过；代码完成归档后，`openspec/specs/local-console/spec.md` 不得同时存在允许本地 acceptance pre-pass 与禁止同一能力的相互冲突条款。

### 4. SQLite 事务边界

#110 的 `t5-store.ts` 已有单项记录函数。本 change 补齐组合事务入口，避免跨多次 worker command 出现中间态：

- `recordLocalAcceptancePassAndMaybeRequestIntegration`
- `recordLocalAcceptanceFailureAndRepair`
- `recordLocalAcceptanceFormatReminder`

组合事务内按顺序写：

1. source message processed / cursor 状态只在所有 visible side effect 成功后更新。
2. acceptance fact / integration event / repair edge 与 visible system message 同事务。
3. `local_acceptance_facts` 的 evidence JSON 不保存完整 message body，只保存 digest 与结构化逐条依据，避免把整段验收评论复制进 ledger。

复验历史策略：

- `local_acceptance_facts` 当前主键为 `(session_id, task_id, role)`，实现阶段需要调整为可保存历史，或新增 `superseded_at` / `attempt` / `source_message_id` 等等价机制。
- 最新事实驱动 parent rejoin；旧 failed fact 不得被物理抹掉到 timeline 无迹可循。最低要求是保留 failed repair 的 visible system record 或 repair child reference，可审计先失败后修复的过程。
- 若保留主键覆盖策略，必须在 evidence 或 companion table 中保存 previous verdict reference；否则采用追加式 facts，并由查询层取 latest。

### 5. 验收脚本

扩展 `scripts/acceptance/local-console-t5.ts`：

- `--case acceptance-loop`：创建 parent + child session，写入 formal acceptance statements，注入 product-manager 逐条通过消息，断言 `listLocalT5Facts()` 出现 passed fact、integration event 或 parent progress；再注入不通过消息，断言 failed fact 与 repair handoff。
- `--case acceptance-format-error`：注入只写“验收通过”但无逐条走查的消息，断言没有 passed fact，时间线存在 visible reminder / error。
- `--case acceptance-integration-write-failure`：注入 parent integration visible write 失败，断言 cursor 不推进、不消费同消息 handoff、不记录 completed integration request，retry 后只生成一个 deduped parent progress。
- `--case acceptance-recheck-after-repair`：同一验收角色先输出不通过，再 repair 后输出通过，断言 latest passed fact 驱动 rejoin，同时 failed repair visible record 或 repair reference 仍可见。
- `--case acceptance-projection-missing`：child session 缺 formal acceptance statements projection 时收到验收角色消息，断言 visible blocked/error，不伪造范围，不写 passed fact。
- `--case acceptance-store-timeout`：注入 SQLite 组合事务或 store command timeout，断言 session drain 在配置超时内释放，消息保持 retryable 或 visible diagnosed。

脚本最终写 `artifacts/acceptance/t5-evidence.json`，记录每个 case 的 SQLite facts、timeline 摘要、命令退出码。

## 权衡
- 不在本 issue 重做 #110 的 CEO no-mention 兜底、child orchestration 总链路、dead-letter 全量 parity、worktree diff 回流；这里只接入验收走查/回流切片。
- 不把 QA 建议自动改写成新验收语句。验收语句是需求侧资产，QA 只能提出测试设计建议，需求持有者确认后才并入 formal list。
- 不复用 GitHub runner 的 acceptance pre-pass adapter 原样写入本地；本地需要围绕 `session_messages`、parent child session 和 SQLite transaction 建原生 adapter，但 parser 和判定规则保持一致。
- 解析失败时优先 visible reminder，而不是直接失败整条 session。这样能让用户修正格式，同时保留可追踪错误状态。
- 接受 QA 提出的静态准入分支：本 change 负责替换 local-console 事实源中的预 T5 acceptance 禁止条款，而不是等待 #110 总方案另行归档。

## 风险
- 风险：当前本地 goal projection 仍是 #110 基线，formal acceptance statements 可能只存在 child initial body。缓解：先支持从受控 child body 提取，再把 projection 读取做成可插拔入口。
- 风险：组合事务如果过大，会和现有 worker command schema 产生冲突。缓解：先保持命令窄输入，测试覆盖 visible write failure 不推进 cursor；必要时拆成一个明确的 `local-record-acceptance-prepass-result` 命令。
- 风险：repair child session 创建语义可能与后续完整 CEO 编排重叠。缓解：repair key 使用稳定 prefix，后续完整编排可按 hidden key 找回，不重复创建。
- 风险：追加式 acceptance facts 会影响现有 `listLocalT5Facts()` 输出假设。缓解：保持向后兼容字段，新增 latest 选择 helper；测试同时检查历史可见与 latest verdict。
- 回滚：删除 runtime pre-pass 调用后，parser 和 store 扩展不会影响普通 mention trigger；SQLite 新表/字段保持向后兼容。
