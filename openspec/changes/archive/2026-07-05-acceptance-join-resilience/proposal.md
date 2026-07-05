# 提案：acceptance-join-resilience

## 背景

2026-07-05 M3 T9 dogfood 复盘：tranfu-agents-app 5 个子 issue（#97/#98/#99/#101/#102）在 PM 全部发出「验收通过」后整体停摆，集成验收 join 永远 `waiting`，父 issue #96 收不到集成验收请求，所有会话无 mention 死锁。根因链有四层，每层都缺一个可见化 / 兜底动作：

1. **验收走查解析静默失败**：`parseAcceptanceWalkthrough` 对 #99（markdown 表格）和 #102（「原验收 N 通过」前缀）的 PM 通过结论解析失败，`processChildTaskAcceptance` 静默 `return null`——无日志、无升级，账本验收事实缺失。
2. **closed 子 issue 永远 missing**：#100 经 dev-manager 裁决 + PR merge 后关闭，从未产生可解析的验收走查；join 对它永远输出 `pending:missing`，且 closed issue 不再被轮询，死锁不可自愈。
3. **走查格式无硬约束**：PM persona 只要求「每条结论含通过/不通过」，没有规定 parser 可识别的编号行格式，表格 / 变体前缀都是合规输出。
4. **无 mention 兜底路由不覆盖 agent 评论**（= roadmap M3 T11 背景）：M2 T8 兜底只认 `speaker=user`；agent 自己发的无 mention 终局评论 skip:no-trigger → 5 tick 后 demote idle → 编排死锁。

## 提案

对应四项修复（A–D）：

- **A · 走查解析失败可见化**：reviewer 评论声明整体「通过」结论但走查解析失败时，记日志事件并由 CEO 追加一条格式提醒（mention 该 reviewer，附规范格式模板）；同一 issue 最多提醒 2 次，超过只记日志，防止 PM↔CEO 空转。
- **B · closed child 阻断上报**：join `waiting` 时对 `missing` 的子 issue 核实 GitHub 状态，发现已 closed 则在父 issue 发一条 blocked 评论（hidden key 防重），不再无声等待；状态查询失败 fail-open 维持 waiting。
- **C · 走查格式硬约束 + parser 放宽**：PM persona 增加规范走查格式硬规定（编号行 + 整体结论行，禁表格）；parser 同步放宽，接受 `- 原验收 N`、`验收语句 N`、表格管道前缀等近似形态。
- **D · 兜底路由扩展至 agent 评论**（实现 roadmap M3 T11）：最新评论为 agent 所发、无合法 mention、issue 是账本 child task 且任务未闭环时，触发既有 CEO 兜底路由判定（no_action / 单 mention append）；账本显示该 child 已 pass 时确定性记 no_action，不调 codex。防重沿用 comment-id route ledger，fail-open 语义不变。

## 影响

- `src/runner.ts`：prepass（A/B）、`parseAcceptanceWalkthrough` 行匹配（C）、`maybeRouteExternalNoMentionComment`（D）。
- `src/github.ts`：新增 issue 状态查询 helper（B）。
- `src/format-ceo.ts`：`formatExternalCommentRoute` 增加可选账本上下文注入（D）。
- `agents/product-manager.md`（C）、`agents/ceo.md` 兜底路由判据扩展（D）。
- `openspec/specs/github-issue-runner/spec.md`：T4 增补规则与场景，新增 T11 小节。goal-ledger 域不变（join 保持纯函数）。
- 不改：观察者、driver pool、worktree、roundtable、goal-intake 各路径。
