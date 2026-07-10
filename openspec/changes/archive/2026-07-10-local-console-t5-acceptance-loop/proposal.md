# 提案：local-console-t5-acceptance-loop

## 背景
#110 已把 T5 总方案与 MUST 基线合入 main，并落下 `src/local-console/t5-store.ts`、SQLite T5 fact tables、child session / route / integration / dead-letter / workspace diff 的基础命令，以及 `local-console-t5-full-parity` 的完整矩阵。

本子 issue #112 只推进其中一条 production 切片：product-manager / hermes-user / qa 的本地逐条验收走查、通过/不通过解析、回流路由与账本/本地状态记录。它属于 runtime/SQLite 冲突组，依赖本地交棒总线，因此必须在 `src/local-console/runtime.ts` 的普通 mention trigger 前增加本地 acceptance pre-pass，并复用 #110 的 `t5-store.ts` 状态入口。

需求持有者在 issue 时间线明确补充：采访无新问题，直接基于 #110 基线产出 plan-written；推进顺序是 qa → PM → 实现 → 落地，最终 commit+push+PR base main 并关闭 #112。

## 提案
本 change 规划一个窄范围的 T5 local acceptance loop：

1. **qa 测试设计审查入口**：把方案和验收语句交给 qa 审查，不把 QA 建议自动并入需求侧验收清单，除非需求持有者后续明确确认。
2. **验收走查解析器**：新增本地可复用 parser，识别验收角色消息中的严格行格式：
   - `N. 通过 — 依据`
   - `N. 不通过 — 依据`
   - `验收结论：通过/不通过`
   parser 必须校验编号连续、覆盖全部 formal acceptance statements、逐条状态与总状态一致；格式不可解析时返回结构化诊断。
3. **local acceptance pre-pass**：在 `LocalConsoleRuntime.processPending()` 的普通 mention trigger 前，对 `qa` / `product-manager` / `hermes-user` 的 agent 消息执行 pre-pass：
   - 通过：写入 `local_acceptance_facts`，并根据 child/parent 关系写 parent integration request 或完成事件。
   - 不通过：写入 failed acceptance fact，并按稳定 repair key 创建/找回 repair child session，或至少写 visible local system handoff 给 dev。
   - 解析失败：写 visible format reminder / error state，不推进为成功验收事实，不静默丢失。
4. **本地状态与可见回流原子性**：acceptance fact、integration event、repair handoff、format reminder 等可见副作用必须保持“先可见、后推进 cursor”的边界；可见写失败时保留可重试状态。
5. **OpenSpec 边界替换**：本 change 同时修改 `local-console` 的「边界」要求，把现有“不得实现 T5-only full acceptance pre-pass”的预 T5 禁止条款替换为“允许本地 acceptance-loop 切片，但仍禁止 GitHub runner 语义变更、T6 flag 与非本切片 T5 parity”。归档时不得同时保留互相冲突的 MUST 与 MUST NOT。
6. **验收脚本落地**：扩展 `scripts/acceptance/local-console-t5.ts`，覆盖本 issue 两条正式验收语句，并纳入 QA 提出的故障注入建议：parent integration visible write 失败、先失败后复验通过、编号/数量/总状态格式错误、缺 formal acceptance statements projection、SQLite command timeout。

## 影响
受影响模块：

- `src/local-console/runtime.ts`：在普通 trigger 前插入 acceptance pre-pass；确保同 session 串行与 cursor 重试边界不破坏。
- `src/local-console/t5-store.ts` 与 `src/sqlite-state-worker.ts`：按需补齐 acceptance fact / integration event / repair session / visible reminder 的组合事务，避免状态成功但消息不可见。
- 新增或扩展 `src/local-console/acceptance-loop.ts`：承载解析器、pre-pass 判定和可测试纯逻辑。
- `tests/local-console.test.ts`：覆盖 parser、通过写 fact、失败 repair、解析失败提醒、可见写失败不消费 handoff。
- `scripts/acceptance/local-console-t5.ts`：新增 `acceptance-loop` 与 `acceptance-format-error` case。
- `openspec/changes/local-console-t5-acceptance-loop/specs/local-console/spec.md`：只补本地验收走查/回流规则；不修改 GitHub issue runner spec，不重复 #110 总矩阵。

对外行为：

- 本地 child session 中验收角色按协议输出逐条走查后，系统会把事实写入 SQLite，并驱动 parent integration request 或 repair handoff。
- 同一角色先不通过、repair 后再通过时，最新验收事实用于驱动 rejoin，同时失败回修留在 visible timeline 或 repair reference 中。
- 验收格式无法解析时，用户会在本地时间线看到可见提醒或错误状态；系统不会把这条消息当作通过事实，也不会静默跳过。
- GitHub issue runner、GitHub comment / reaction / release artifact、observer 和 GitHub worktree 行为保持不变。

## QA 测试设计建议处理
QA 在 timeline index 5 提出的五条增补作为测试设计覆盖纳入本方案与 tasks；它们暂不改写本 issue 的正式验收语句。若需求持有者后续明确接受，可在实现完成前追加到正式验收清单。

## 验收语句
1. 本地验收角色按 N. 通过/不通过 与 验收结论 输出 → 应写入本地验收事实并驱动通过回流或失败回修。
2. 验收走查格式无法解析 → 应产生可见提醒或错误状态，不应静默丢失验收事实。
