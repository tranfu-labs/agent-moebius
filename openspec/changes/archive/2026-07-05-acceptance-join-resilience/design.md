# 设计：acceptance-join-resilience

## 方案

### A · 走查解析失败可见化（`processChildTaskAcceptance`）

现状：`parseAcceptanceWalkthrough(body, statements)` 返回 null 时直接 `return null`，静默落回普通触发流程。

改造：parse 为 null 时增加一个判定分支——仅当 `parseOverallAcceptanceStatus(body) === "passed"`（评论明确声明整体通过结论）才升级；其余 null（普通评论、中间过程评论）保持原样静默落回。升级动作：

1. 统计当前 issue 时间线里含 `<!-- moebius:acceptance-format-reminder -->` 标记的评论数。
2. **计数 < 2**：log `acceptance-walkthrough-unparsed`（issueKey、taskId、reviewerRole、commentId、reminderCount），以 CEO envelope 发一条格式提醒评论：mention 该 reviewer 角色，附规范走查格式模板（编号行 `N. 通过/不通过 — 依据` × 每条验收语句 + 整体行 `验收结论：通过/不通过`），正文含 reminder 标记，返回 `"triggered-success"`。
3. **计数 ≥ 2**：只 log（reason=`reminder-cap-reached`），`return null` 落回普通流程（修复 D 的 agent 兜底路由可接手路由，避免 PM↔CEO 无限空转）。

说明：升级分支会抢占同评论里的 mention 触发（prepass 先于 resolveTrigger 返回 outcome）。这是有意取舍——验收事实缺失是死锁根因，格式重发优先；reviewer 重发规范走查后链路自愈。

### B · closed child 阻断上报（join `waiting` 分支）

现状：`evaluation.status === "waiting"` 只 log `integration-acceptance-waiting` 后返回 `"no-trigger"`。

改造：waiting 时对 `pending` 中 `reason === "missing"` 的项逐个查询子 issue 状态：

1. `src/github.ts` 新增 `fetchIssueState(source): Promise<"open" | "closed">`（`gh issue view <n> --json state`，走既有 `runCommand` + retry 适配器），调用处以 `CEO_ORCHESTRATION_ACTION_TIMEOUT_MS` 包裹。
2. 任一查询失败 → log `integration-acceptance-child-state-check-failopen`，保持原 waiting 行为返回 `"no-trigger"`（fail-open，不因网络抖动误报阻断）。
3. 存在 closed 的 missing 子 issue → 构造 hidden key `moebius-integration-blocked-key:<sha256(phaseId + 升序 closed issueKey 列表)[0:64]>`；fetch 父 issue，`issueContainsHiddenKey` 命中则 log 去重后返回 `"no-trigger"`；未命中则在父 issue 发 blocked 评论（CEO envelope + `formatIntegrationAcceptanceBlockedBody`，reason=`closed-child-without-acceptance`，正文列出 closed 子 issue、mention reviewer 角色，指引：重开子 issue 并补规范走查，或明确豁免等待真人裁决；末尾带 hidden key），log `integration-acceptance-blocked`，返回 `"triggered-success"`。
4. 无 closed 的 missing → 维持原 waiting 行为。

join（`evaluateIntegrationAcceptanceJoin`）保持纯函数不动；GitHub 状态核实是 runner 侧职责。

### C · 走查格式硬约束 + parser 放宽

- `findAcceptanceLineForStatement` 前缀正则从 `^\s*(?:[-*]\s*)?(?:验收语句\s*)?N[.、)．:：\s]` 放宽为：
  `^\s*(?:[-*]\s*)?(?:\|\s*)?(?:(?:原|正式)?验收(?:语句)?\s*)?N[.、)．:：\s|]`
  覆盖 `- 原验收 1 通过：…`、`验收 1：通过`、`| 1 | 通过 |` 等近似形态。语句文本本身不含编号的纯表格（#99 形态）不强行解析，由 persona 硬约束杜绝。
- `agents/product-manager.md` 「验收职责」增加硬格式规定：逐条走查必须使用编号行 `N. 通过/不通过 — 依据`（N 与验收语句序号一致，每条独立一行，不用表格、不加「原验收」等前缀变体）；汇总必须含独立一行 `验收结论：通过` 或 `验收结论：不通过`。

### D · 兜底路由扩展至 agent 评论（roadmap M3 T11）

`maybeRouteExternalNoMentionComment` 重构为双分支：

- **user 分支**：现有行为完全不变（issue-body 目标形状 digest key、`hasMoebiusMetadata` 守卫、active 门、comment-id 防重）。
- **agent 分支**：`latestMessage.speaker ∈ agentNames` 且 `source === "comment"` 且 intake mode 为 active 时进入（不套 `hasMoebiusMetadata` 守卫——agent 评论必然带 stage marker 等 metadata）：
  1. routeKey = comment id；`externalCommentFallbackRoutes[routeKey]` 已存在 → log skip（already-routed）返回 null。
  2. 账本门：`loadGoalLedgerState` → `findTaskByChildIssue(ledger, source)`；找不到 child task（非编排 issue）→ 返回 null，行为同现状。
  3. 该 task 对本 issue 的最新验收事实为 `passed`（任务已闭环）→ 不调 codex，确定性记 no_action route（reason=`ledger-task-closed`），返回 `no-trigger` outcome（route 记录随 fold 落 intake state，防重复判定）。
  4. 未闭环（无事实或最新为 failed）→ 调 `formatExternalCommentRoute`，输入新增可选 `ledgerContext`（task id、标题、验收语句清单、最新验收事实状态摘要），prompt 注入该上下文；CEO 按 ceo.md 扩展判据输出 `no_action`（任务实际已终局）或 `append`（单 mention 指向下一个待发言角色）。APPEND / NO_ACTION / FAIL_OPEN 的发布、记录、fail-open 语义与 user 分支完全一致。
- `agents/ceo.md` 「外部无 mention 评论兜底路由判定」小节扩展：说明该判定同样适用于「账本 child issue 上 agent 自身的无 mention 评论」，判据为任务是否闭环——未闭环补下一个待发言角色的单 mention，已终局输出 no_action。

事件沿用 `external-comment-route-*`，start 事件增加 `speaker` 字段便于观测。

## 权衡

- **A 的升级门槛选「整体通过结论」而非「任何解析失败」**：prepass 对 reviewer 的每条评论都会尝试解析，中间过程评论（提问、暂不放行说明）解析失败是常态，全量升级会刷屏。代价是「声明 failed 但格式烂」不提醒——failed 场景 persona 已强制 mention @dev，链路不断，且 D 兜底可接。
- **B 选 runner 侧查状态而非把 issue 状态写进账本**：childIssueRefs.status 目前无同步机制（roadmap 已知漂移项），以它为准会误判；实时查 GitHub 一次一两个请求，量级可接受。join 保持纯函数，测试面不扩大。
- **B 的 blocked 只发评论不写账本 integrationAcceptance 事件**：blocked 事件需要 childPassDigest/targetAcceptanceDigest，waiting 分支拿不到 ready 评估的 digest；hidden key 防重已足够，少一条账本写路径少一类失败面。
- **D 的账本门选「找得到 child task 才触发」**：把兜底扩到所有 agent 评论会让每条无 mention 收尾评论都烧一次 codex；T11 目标场景就是编排 child issue 死锁，非编排 issue 维持现状。
- **D 的「已 pass 确定性 no_action」不调 codex**：闭环判断是纯账本事实，模型判定徒增成本与不确定性。

## 风险

- **A 提醒与原评论 mention 的抢占**：含 mention 的通过结论若格式烂，本轮 mention 不消费（下一轮由 reviewer 重发走查续链）。极端情况下多一轮对话,可接受;回滚 = 去掉升级分支恢复静默 null。
- **B 对 gh 的额外调用**：仅在 join waiting 且存在 missing 项时发生,单次 O(missing 数);retry 适配器覆盖瞬断。
- **C parser 放宽的误匹配**：前缀仍锚定行首 + 编号 + 分隔符,且只作用于 reviewer 角色评论的解析尝试;新增单测覆盖误匹配面（如正文引用「验收 1」的叙述行不含通过字样时不计入）。
- **D 死循环**：CEO append 必带单 mention → 下轮走普通 mention 触发,不再进兜底;no_action / fail_open 均记 comment-id 防重。CEO 自身 bypass 评论若无 mention 且落在 child issue 上会被判定一次,判定结果同样防重,有界。
- 回滚思路：四项相互独立,任一出问题可单独 revert 对应分支逻辑,不影响其余三项。
