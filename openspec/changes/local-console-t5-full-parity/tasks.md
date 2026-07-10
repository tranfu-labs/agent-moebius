# 任务：local-console-t5-full-parity

## 执行清单

- [ ] 方案与 OpenSpec delta 校验
  - [ ] 保持 delta 位于 `openspec/changes/local-console-t5-full-parity/specs/local-console/spec.md` 与 `specs/console-ui/spec.md`。
  - [ ] 不新增 `openspec/changes/local-console-t5-full-parity/specs/github-issue-runner/spec.md`，`github-issue-runner` 只作为 MUST 矩阵事实源。
  - [ ] 用 local-console delta 修改现有 T5-only 禁止边界，确保归档后不同时保留同一能力的 MUST 与 MUST NOT 冲突。
  - [ ] 运行 `pnpm exec openspec validate local-console-t5-full-parity --strict` 并保持退出码 0。
- [ ] 建立本地对等状态模型
  - [ ] 为 local sessions 增加 `parent_session_id` 与 child session 查询。
  - [ ] 建立 local role thread store，按 session + role 维护 thread id 与 last seen message id。
  - [ ] 建立 local ledger projection / acceptance fact / integration event / route decision / dead-letter / workspace diff 持久化。
  - [ ] 保证所有 visible local side effects 与对应状态写入在同一事务内完成或整体失败。
- [ ] 接入本地 CEO guardrail 与 no-mention 兜底
  - [ ] 在 local agent response 写入前调用 CEO guardrail，支持 no_change / append / fail-open。
  - [ ] 将 CEO append 写为 local CEO message，并交给下一轮 session drain 触发目标 agent。
  - [ ] 为 user no-mention 和 child agent no-mention 建立 CEO route judgment、去重和 fail-open 记录。
  - [ ] 覆盖 append 发布失败不推进 cursor、不保存成功 route decision。
- [ ] 实现子会话编排
  - [ ] 将 CEO spawn child issue executor 抽象为 issue/session 两套 sink，共享校验和 orchestration key。
  - [ ] `goal_intake.confirm` 在本地创建或找回 phase-one child sessions。
  - [ ] 写入 child session refs、parent progress events 与 bounded failure details。
  - [ ] 保证重试不重复创建 child session，部分成功不删除补偿。
- [ ] 实现本地验收 pre-pass 与集成回流
  - [ ] 在普通 trigger 前解析验收角色走查评论。
  - [ ] 写 child acceptance facts，并在全部 in-scope child passed 后创建 parent integration request。
  - [ ] 对 integration acceptance failure 创建或找回 repair child session。
  - [ ] 对整体通过但逐条走查不可解析的评论发 visible format reminder，单 session 封顶。
  - [ ] 对 missing child closed/archived but no pass fact 写 blocked report。
- [ ] 实现 dead-letter 与恢复
  - [ ] 为 local message 处理失败维护 failure count、last reason、next retry。
  - [ ] 达预算后写 visible dead-letter system record，不含合法 agent mention。
  - [ ] 新消息或相关子会话状态变化后可恢复处理，不重放已 dead-lettered 消息。
- [ ] 补齐 worktree 三点对等
  - [ ] worktree mode 下为 session 创建/复用稳定 local branch。
  - [ ] 记录 base ref、branch name、worktree path、diff path。
  - [ ] code-verified 后生成 diff bundle 和 affected files summary。
  - [ ] 显式回流时有界 apply diff 到原目录；失败保留 patch 并写 visible error。
  - [ ] 验证回流前原目录 `git status --short` 为空，回流后出现预期 diff。
- [ ] 扩展桌面操作台 UI
  - [ ] 侧栏渲染 project -> parent session -> child session 树。
  - [ ] 父会话渲染子会话进展流和 blocked/dead-letter/recovery 状态。
  - [ ] 集成 `AcceptCard` 到真实验收提交流，输出协议合规文本。
  - [ ] 渲染 worktree diff bundle、回流按钮、apply result 和错误。
  - [ ] 保持窄视口无文本重叠，侧栏树可扫描。
- [ ] 补齐测试与验收脚本
  - [ ] 增加 local store migration / transaction / idempotency 单元测试。
  - [ ] 增加 local guardrail、no-mention route、agent-authored route 测试。
  - [ ] 增加 local CEO route judgment 永久挂起的 L1 故障注入，验证超时释放 session drain 且不保存成功 route decision。
  - [ ] 增加 child session orchestration、goal-intake confirm、repair child 测试。
  - [ ] 增加 acceptance pre-pass、integration request、format reminder、blocked report 测试。
  - [ ] 增加 CEO append visible write failure 的 S1/V1 故障注入，验证 cursor 不推进、成功 route decision 不保存、后续 retry 可重入。
  - [ ] 增加 acceptance fact 成功但 parent integration request visible write failure 的 S1/V1 故障注入，验证不消费同消息 handoff、不记录 completed integration request。
  - [ ] 增加 dead-letter retry/recovery 测试。
  - [ ] 增加 visible dead-letter write failure 的 S1/V1 故障注入，验证 cursor 不推进且可 retry。
  - [ ] 增加 worktree branch/diff/apply/no-pollution 测试。
  - [ ] 增加 diff apply 冲突或永久挂起的 L1 故障注入，验证超时写 visible error、保留 patch、释放 session、原目录不半写脏。
  - [ ] 增加 console-ui child tree、acceptance submit、dead-letter、diff 回流测试。
  - [ ] 新增 `scripts/acceptance/local-console-t5.ts`，支持 `multi-child-goal`、`route-hang-l1`、`visible-write-s1-v1`、`acceptance-integration-s1-v1`、`worktree-diff`、`diff-apply-failure-l1`、`dead-letter-recovery`、`dead-letter-write-failure-s1-v1`、`fake-gh-zero` case，并生成 `artifacts/acceptance/t5-evidence.json` 和必要截图。
- [ ] 验收与收尾
  - [ ] 运行 `pnpm exec tsx scripts/acceptance/local-console-t5.ts`。
  - [ ] 使用 fake `gh` 前置 PATH 跑 T5 acceptance，确认 fake `gh` 调用次数为 0。
  - [ ] 运行 `pnpm test`。
  - [ ] 运行 `pnpm typecheck`。
  - [ ] 运行 `pnpm --filter @agent-moebius/desktop build`。
  - [ ] 运行 `pnpm --filter @agent-moebius/console-ui test`。
  - [ ] 运行 `git diff --check`。
  - [ ] 更新 `docs/roadmap/milestone-4-local-console.md`，勾选 T5，记录验收证据，并明确 T6 flag 与 M3 A-K 不在 T5。
  - [ ] commit、push、开 PR；PR body 包含 T5 证据、MUST 矩阵路径和 `Closes #...`。

## MUST 矩阵索引
说明：完整分类与处理说明见 `proposal.md` 的「MUST 矩阵」。本节保留同一组源行映射，便于直接在任务文件中核对验收。矩阵覆盖 `openspec/specs/github-issue-runner/spec.md` 中全部 552 行包含字面量 `MUST` 的源行；只统计项目符号 `- MUST` 的 463 行不是本任务验收口径。

| 源 | 分类 | 执行任务 |
| --- | --- | --- |
| GIR:L9-L25 | 不在 T5 范围 | 不做 GitHub polling/config。 |
| GIR:L26 | 本任务补齐 | dead-letter / visible cursor boundary。 |
| GIR:L27-L38 | 不在 T5 范围 | 不做 GitHub issue state/window。 |
| GIR:L39-L41 | 本任务补齐 | local failure budget 状态。 |
| GIR:L42-L47 | 本任务补齐 | user no-mention route。 |
| GIR:L48-L53 | 不在 T5 范围 | 不重构 GitHub runner 模块。 |
| GIR:L54-L56 | 本任务补齐 | local visible boundary transaction。 |
| GIR:L57-L60 | 本任务补齐 | local dead-letter record / no self trigger。 |
| GIR:L61-L74 | 已对等 | T4/T4.5 local drain 与 session concurrency。 |
| GIR:L75 | 已对等 | T4.5 local cursor/restart catch-up，不依赖执行中标记。 |
| GIR:L76-L78 | 不在 T5 范围 | GitHub issue not-found/closed only。 |
| GIR:L79 | 本任务补齐 | local failure folding。 |
| GIR:L80-L86 | 不在 T5 范围 | GitHub CLI only。 |
| GIR:L87-L89 | 本任务补齐 | local first visible result boundary。 |
| GIR:L90-L96 | 已对等 | shared Codex watchdog。 |
| GIR:L97-L113 | 已对等 | shared agent discovery / trigger / protocol；T5 UI 只生成合规输入。 |
| GIR:L114-L141 | 本任务补齐 | local CEO guardrail stage route。 |
| GIR:L142-L147 | 已对等 | shared timeline/trigger/preScript registry baseline。 |
| GIR:L148-L153 | 不在 T5 范围 | GitHub reaction only。 |
| GIR:L154-L165 | 不在 T5 范围 | GitHub issue media only。 |
| GIR:L166-L168 | 已对等 | frontmatter/workspaceAccess baseline。 |
| GIR:L169-L186 | 本任务补齐 | local branch / diff return / clean original。 |
| GIR:L187-L189 | 已对等 | T4 local interruption。 |
| GIR:L190-L203 | 本任务补齐 | local role threads and resume。 |
| GIR:L204-L223 | 本任务补齐 | local artifacts/evidence manifest。 |
| GIR:L224-L247 | 不在 T5 范围 | observer only。 |
| GIR:L248-L263 | 本任务补齐 | local acceptance card protocol submit。 |
| GIR:L264-L292 | 已对等 | shared persona / qa / invariants。 |
| GIR:L293-L327 | 本任务补齐 | local CEO guardrail / CEO agent parity。 |
| GIR:L328 | 不在 T5 范围 | T5 不新增 driver agent；未来 agent 白名单维护不进本任务。 |
| GIR:L329-L334 | 本任务补齐 | local agent writeback and role-thread boundary。 |
| GIR:L336-L371 | 不在 T5 范围 | roundtable / M4 T6 flag out of T5。 |
| GIR:L449-L462 | 已对等 | shared security and spawn constraints。 |
| GIR:L466-L472 | 本任务补齐 | local handoff/wait rendering and validation。 |
| GIR:L473-L500 | 已对等 | shared T7 guardrail scenarios reused by local visible sink。 |
| GIR:L501-L1716 | 已对等 | scenarios inherit mapped rules; local acceptance covers T5-relevant subset。 |
| GIR:L1722-L1745 | 不在 T5 范围 | observer ledger UI only。 |
| GIR:L1847-L1879 | 本任务补齐 | CEO child issue -> child session executor。 |
| GIR:L2027-L2046 | 本任务补齐 | local acceptance pre-pass / integration / repair。 |
| GIR:L2143-L2164 | 本任务补齐 | local goal-intake runtime to child sessions。 |
| GIR:L2272-L2277 | 本任务补齐 | local agent-authored no-mention route。 |
| GIR:L2303-L2308 | 本任务补齐 | T5 tests/typecheck/roadmap/PR evidence。 |
| LC:T4.5 | 已对等 | handoff drain / cursor / restart catch-up。 |
| LC:T4.6 | 已对等 | project/workspace source / worktree on-off。 |
| LC:spec L48-L50 | 本任务补齐 | replace T5 prohibition with positive T5 rules through current `specs/local-console/spec.md` delta。 |
