# 提案：external-comment-fallback-ceo-audit-t8

## 背景
里程碑 2 T8 要消除两个运行时协作缺口：

1. active issue 上最新外部评论没有合法 agent mention 时，当前 mention trigger 会静默返回 `no-trigger`，导致“验收通过 / 你去做 X”这类有路由意图但漏写 `@` 的评论停住闭环。issue 41 已出现 loop watcher 手工补 ping 的实测卡点。
2. 当前只有被 CEO 修正过的评论带 `ceo-corrected` metadata；CEO `no_change` 的正常 agent 评论、媒体 / artifact 错误评论、dead-letter 等 runner 发布路径从评论 body 本身看不出是否经过 guardrail 或为何绕过 guardrail，无法审计伪装 envelope。

T8 还要求在方案阶段先对 issue 41 的矛盾 PM 结论对做只读取证。PM 已确认：若原始 runner 日志不可得，不得凭空归因，也不得把未证实的双实例 / 伪装 / 日志误读扩大成 T1/T2 修复范围。

## 提案
最小范围实现三件事：

1. **active 外部无 mention 兜底路由**：
   - 只在 issue 当前本地 intake state 为 active，且最新 timeline message 是 `speaker=user` 的 comment，且没有合法 agent mention 时运行。
   - 调用 CEO 式轻量无状态路由判定：输出 `no_action` 或 `append`；`append` 正文必须且只能包含一个合法 agent mention。
   - `append` 用 `ceo` role envelope 发布，留给下一轮 active poll 的普通 mention trigger 处理。
   - 同一 comment id 只判定一次；结果记录到 intake state，包含 comment id、outcome、时间和必要细节。判定失败 fail-open，不发评论，但记录 `fail_open` 并保持原 no-trigger 语义。

2. **CEO 覆盖可审计**：
   - 新增统一 metadata：`<!-- moebius:ceo-reviewed action=<action> ... -->`。
   - 所有 runner 发布路径都必须带审计标记：实际调用 CEO 的评论记录 `no_change` / `replace` / `append` / `fail_open` 等结果；不适用或未调用 CEO 的系统错误评论、dead-letter、兜底路由 append 记录 `bypass` / `not_applicable` reason。
   - 既有 `<!-- moebius:ceo-corrected -->` 保留，只表示 CEO 发生 replace 或 append 修正，是 `ceo-reviewed` 的子类信号，不再承担“是否经过 CEO”的唯一审计职责。

3. **issue 41 取证结论与范围裁剪**：
   - 取证结论写入本 change 的 `design.md`。
   - 当前可证实：issue 41 上确有两组 product-manager 相反结论对，分别相隔 19 秒与 44 秒，且评论 body 均含 runner role metadata。
   - 当前不可证实：本 worktree 无 `.state/*`，`/tmp` 下无可读 `moebius-*` runDir，仓库内没有对应原始 runner 日志；因此无法证明“双 runner 实例并发 / 补发进程伪装 envelope / 日志误读”三者之一。
   - 修复范围裁剪为 T8 已列模块：兜底路由、审计标记、CEO persona 路由判据与对应测试；不在本任务内新增进程级防重或协议重写。

## 影响
- 运行时模块：`src/runner.ts`、`src/format-ceo.ts`、`src/github-response-intake.ts`、`src/issue-dispatcher.ts`、`src/triggers/`。
- Persona：`agents/ceo.md` 增加外部无 mention 路由判据和输出约束。
- 事实源：`openspec/specs/github-issue-runner/spec.md` 归档时合入本 change 的 spec delta；`docs/architecture/module-map.md` 与 `AGENTS.md` 同步新增职责。
- 测试：补 runner、format-ceo、intake state、trigger / conversation 相关单元测试；最后跑 `pnpm test`、`pnpm typecheck`、`git diff --check`。
