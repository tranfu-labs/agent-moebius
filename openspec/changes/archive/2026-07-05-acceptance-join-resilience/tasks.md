# 任务：acceptance-join-resilience

- [x] A1 `processChildTaskAcceptance`：解析失败 + 整体通过结论 → log `acceptance-walkthrough-unparsed` + CEO 格式提醒（reminder 标记、≤2 次封顶）
- [x] A2 单测：未解析通过结论触发提醒；中间评论不触发；封顶后只 log 落回；提醒正文含 reviewer mention 与格式模板
- [x] B1 `src/github.ts` 新增 `fetchIssueState` + args builder
- [x] B2 join waiting 分支：missing 子 issue 状态核实 → closed 则父 issue blocked 评论（hidden key 防重）+ log；查询失败 fail-open
- [x] B3 单测：closed missing 触发 blocked 上报且防重；open missing 维持 waiting；状态查询失败 fail-open
- [x] C1 `findAcceptanceLineForStatement` 前缀正则放宽（原验收/验收/表格管道）
- [x] C2 单测：`- 原验收 N 通过`、`| N | 通过`、`验收 N：通过` 可解析；叙述行不误匹配
- [x] C3 `agents/product-manager.md` 验收职责增加硬格式规定
- [x] D1 `maybeRouteExternalNoMentionComment` agent 分支：账本门 + 已 pass 确定性 no_action + 未闭环走 CEO 路由
- [x] D2 `formatExternalCommentRoute` 支持可选 `ledgerContext` 注入 prompt
- [x] D3 `agents/ceo.md` 兜底路由判据扩展至 agent 自身评论
- [x] D4 单测：agent 无 mention + 未闭环 → CEO append；已 pass → 确定性 no_action 不调 codex；同 comment id 防重；非编排 issue 不触发；fail-open 保持现状
- [x] E1 spec-delta 覆盖 A–D 规则与场景
- [x] E2 全量 `pnpm test` + `pnpm typecheck` 通过
