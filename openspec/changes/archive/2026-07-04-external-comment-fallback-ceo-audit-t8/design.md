# 设计：external-comment-fallback-ceo-audit-t8

## 方案

### 1. 入口与判定边界
兜底路由不改普通 mention trigger 的优先级。runner 仍先执行 `resolveTrigger`：

1. 若最新消息有合法 agent mention，继续走现有 agent Codex 路径。
2. 若 trigger 为 `skip/no-trigger`，再检查是否满足 T8 兜底条件：
   - 当前 issue 在 intake state 中是 active。changed job 也要携带处理前的 issue state，避免 active issue 被 idle scan changed job 命中时丢失 active-only 语义。
   - 最新 timeline message 的 `source = "comment"`。
   - 最新 timeline message 归一化后 `speaker = "user"`，且原始 comment body 不含任何 `moebius:*` runner 机器 metadata；也就是最新 comment 不是 dead-letter、CEO append、agent envelope 或其他 runner 发布产物。
   - 最新 comment 正文没有合法 agent mention。
   - 该 GitHub comment id 尚未在 intake state 的兜底路由记录中出现。

不满足任一条件时保持现有 `no-trigger`。

### 2. CEO 式外部评论路由
在 `src/format-ceo.ts` 新增独立函数，例如 `formatExternalCommentRoute`。它复用 `agents/ceo.md` persona 和 `runCodex` adapter，但使用单独 prompt 与输出 schema：

```ts
type ExternalCommentRouteResult =
  | { action: "NO_ACTION"; reason: "ceo-no-action" }
  | { action: "APPEND"; body: string; targetRole: string; reason: "appended" }
  | { action: "FAIL_OPEN"; reason: "..."; detail?: string };
```

CEO persona 输出只允许：

- `{"action":"no_action"}`
- `{"action":"append","body":"..."}`

TypeScript 后置校验负责：

- JSON 合法且 action 已知。
- append body 非空。
- append body 的非代码区域里必须且只能出现一个合法 agent mention。
- mention role 必须在可触发 agent 白名单内，且不能是 `ceo`。

业务判据只放在 `agents/ceo.md`：判断“验收通过 / 你去做 X / 可以开始实现 / 继续处理”等路由意图；没有明确下一步控制权时输出 `no_action`。TypeScript 不根据关键词做业务路由。

### 3. 发布与状态记录
兜底路由结果映射：

- `NO_ACTION`：不发评论；记录 comment id 的 `outcome = "no_action"`；处理 outcome 仍按 `no-trigger` 折叠，active issue 保持 active。
- `APPEND`：用 `formatAgentComment("ceo", body)` 发布 CEO role envelope，并追加 `ceo-reviewed` 审计 metadata；记录 `outcome = "append"`、target role 与时间；处理 outcome 按可见发布成功折叠。
- `FAIL_OPEN`：不发评论；记录 `outcome = "fail_open"` 与失败 reason；处理 outcome 按现有 `no-trigger` 折叠，避免同一坏判定每分钟重试耗费成本。

为保证同一 comment id 只判定一次，扩展 intake state：

```ts
interface ExternalCommentFallbackRouteRecord {
  commentId: string;
  outcome: "no_action" | "append" | "fail_open";
  decidedAt: string;
  targetRole?: string;
  reason?: string;
}

interface IntakeIssueState {
  externalCommentFallbackRoutes?: Record<string, ExternalCommentFallbackRouteRecord>;
}
```

`github-response-intake.ts` 只保存和合并这份纯业务状态，不调用 GitHub、Codex 或文件系统。为避免 state 无限增长，可在记录当前 comment id 时保留最近有限条记录，测试先覆盖“同一 comment id 不重复判定”。

### 4. CEO 审阅 metadata
在 `src/format-ceo.ts` 或邻近发布辅助中增加 metadata helper：

```text
<!-- moebius:ceo-reviewed action=no_change -->
<!-- moebius:ceo-reviewed action=replace -->
<!-- moebius:ceo-reviewed action=append_original -->
<!-- moebius:ceo-reviewed action=append_ceo -->
<!-- moebius:ceo-reviewed action=fail_open reason=codex-timeout -->
<!-- moebius:ceo-reviewed action=bypass reason=media-preparation-failed -->
<!-- moebius:ceo-reviewed action=not_applicable reason=dead-letter -->
```

具体 action 名可在实现时微调，但必须满足：

- 每条 runner 发布的评论 body 都能看出是否经过 CEO、是否被 CEO 纠正、或者为什么未调用 CEO。
- `ceo-corrected` 不删除；replace 与 agent-path append 仍追加它。
- `conversation.ts` 的 speaker 归一化只依赖 `moebius:role=...`，不把 `ceo-reviewed` 当 role metadata。

覆盖发布点：

- 正常 agent no-change / replace / append original / append CEO comment。
- CEO fail-open 后发布原 agent 评论。
- 媒体准备失败评论。
- artifact 发布失败评论。
- dead-letter 系统评论。
- 外部评论兜底 route append。

### 5. issue 41 取证结论
已检查证据：

- `gh issue view 41 --repo tranfu-labs/moebius --json comments`：
  - 2026-07-04T01:37:23Z，product-manager 评论“PM 方案验收结论：暂不通过”，带 `moebius:role=product-manager`，URL `https://github.com/tranfu-labs/moebius/issues/41#issuecomment-4880201671`。
  - 2026-07-04T01:37:42Z，product-manager 评论“方案验收结论：通过”，带 `moebius:role=product-manager`，URL `https://github.com/tranfu-labs/moebius/issues/41#issuecomment-4880202402`。两者相隔 19 秒。
  - 2026-07-04T01:46:16Z，product-manager 评论“PM 验收结论：不通过”，带 `moebius:role=product-manager`，URL `https://github.com/tranfu-labs/moebius/issues/41#issuecomment-4880222742`。
  - 2026-07-04T01:47:00Z，product-manager 评论“代码验收结论：通过”，带 `moebius:role=product-manager`，URL `https://github.com/tranfu-labs/moebius/issues/41#issuecomment-4880224488`。两者相隔 44 秒。
  - 2026-07-04T01:29:53Z 有 loop watcher 手动补触发评论，明示“上一条 PM 采访答复无 `@dev` mention，runner 没自动派 dev 继续”，对应 T8 无 mention 兜底路由目标。
- 当前 worktree：`find .state -maxdepth 2 -type f` 无输出。
- `/tmp`：`find /tmp -maxdepth 1 -type d -name 'moebius-*'` 无输出。
- 仓库文本搜索未发现 issue 41 对应的原始 runner 日志文件。

定性：**其他：原始日志不可得，基于现有 issue metadata 与本地可读运行产物无法证明双实例 / 伪装 / 误读之一**。

裁剪结论：本任务不新增进程级防重、不修改 GitHub 交互协议核心规则、不追溯修复 issue 41 历史评论；只实现 T8 明确范围内的外部无 mention 兜底路由、CEO 覆盖审计标记、persona 路由判据和测试。若后续拿到原始日志并证明双实例或伪装，应另开任务回灌 T1/T2。

### 6. 测试策略
必须新增或更新：

- `tests/github-response-intake.test.ts`：记录 external comment fallback route，保留记录跨 `no-trigger` / `triggered-success` 折叠；同一 comment id 可判重。
- `tests/format-ceo.test.ts`：外部评论路由 parser 接受 `no_action` / append；拒绝 append body 无 mention、多 mention、未知 mention、`@ceo`、空 body、非法 JSON并 fail-open。
- `tests/runner.test.ts`：
  - active issue 最新外部无 mention 评论触发一次 route；`no_action` 不发评论但 state 记录。
  - active issue 最新外部无 mention 评论 route append 时发布 `<ceo>:` envelope，正文只有一个合法 mention，下一轮不重复判定同一 comment id。
  - route fail-open 不发评论，记录 `fail_open`，不重复判定。
  - idle issue 或 runner metadata comment 不触发兜底 route。
  - 任取 agent no-change 发布评论含 `ceo-reviewed`；媒体/artifact/dead-letter 等 bypass 路径也含审计 metadata。
- `tests/conversation.test.ts` 或相关测试：确保 `ceo-reviewed` metadata 不影响 speaker 归一化。

最后运行 `pnpm test`、`pnpm typecheck`、`git diff --check`。

### 7. 正式验收清单
product-manager 已确认接受第 9 条测试设计反馈提出的 5 条增补，并确认接受第 16 条 qa 反馈提出的 2 条增补。当前 T8 实现验收清单正式扩展为 10 条；实现阶段的 `code-verified` 必须逐条给出测试或可核查证据。

正式验收语句：

1. 构造 active issue 上无 mention 的外部评论（含明确路由意图文案）→ 跑一轮 intake → 应看到一次路由判定被执行，产出“无需行动”记录或一条带单个 `@` 的 append 评论；同一评论第二轮不再重复判定。
2. 任取一条 runner 新发布的评论 → 检查 body → 应看到 CEO 审阅标记（含未被纠正的评论）。
3. 打开本任务的 openspec change → 应看到矛盾结论对的取证结论与定性（双实例 / 伪装 / 误读三选一或其他），及据此裁剪的修复范围说明。
4. 构造同一 active issue 由 idle scan `changed` job 命中、最新外部无 mention comment → 应执行一次兜底路由；构造 idle issue 同样输入 → 不执行兜底路由。
5. 构造兜底路由 `append` / `no_action` / `fail_open` 三种结果 → intake state 均按 comment id 记录 outcome；同一 comment id 第二轮均不再调用路由判定。
6. 构造 append body 中无 mention、多 mention、未知 mention、`@ceo`、仅代码块内 mention → parser 必须 fail-open，不发布评论。
7. 任取所有 runner 可见发布路径各一条 → body 均包含 `ceo-reviewed` 或明确 bypass/not-applicable reason；`ceo-corrected` 只出现在 replace/append 修正子类。
8. 旧 `.state/github-response-intake.json` 缺少新增兜底字段时仍可加载与折叠；新增 `ceo-reviewed` metadata 不改变 speaker 归一化。
9. 注入兜底路由调用永久不 settle 或超过测试超时预算 → 处理 active 最新外部无 mention comment → issue job 应有界 settle，记录该 comment id 的 `fail_open`，不发布 append，后续心跳不被阻塞，同一 comment id 第二轮不再调用路由判定。测试可用 fake route promise / timeout 注入，不要求真实挂起外部进程。
10. 构造 fallback append body 的唯一 mention 只出现在 inline code 中，例如正文只有 `` `@dev` `` → parser 必须判为 `fail_open`，不发布评论，并记录该 comment id outcome。

## 权衡
- 不把兜底路由做进 `src/triggers/` 的纯 trigger：trigger 当前只做 timeline + agent 白名单纯解析，不知道 active/idle、comment id 或 intake state。T8 兜底需要 active-only 与按 comment id 防重，因此放在 runner no-trigger 分支，并把防重状态交给 `github-response-intake` 纯状态记录。
- 不靠 `updatedAt` 作为唯一防重：PM 已确认成本控制和审计需要按 comment id 记录 outcome。
- 不硬编码路由关键词：TypeScript 只校验结构和白名单，具体路由判据放 `agents/ceo.md`。
- 不给兜底判定添加 `eyes` reaction：现有 reaction 表示即将进入真实 agent Codex driver；兜底判定是 guardrail 路由，不应伪装成某个 agent 已开始执行。
- 不扩大 issue 41 取证到进程级修复：当前缺原始日志，无法证明双实例或伪装；T8 的审计 metadata 会提升未来取证能力。
- 接受 fail-open 后同一 comment id 不再自动重判的成本控制取舍：这会消耗该评论的一次自动路由机会，但能避免坏链接、坏输出或超时评论每分钟重复消耗 CEO 判定成本；可审计性通过 intake state 的 `fail_open` 记录与日志保证，恢复方式是人工或 loop watcher 发表新评论重新触发。

## 风险
- CEO 路由误判可能发出错误 mention。缓解：只允许一个合法 agent mention，persona 要求不明确时 `no_action`，且 append 留给下一轮 active poll，不在同轮直接运行目标 agent。
- CEO 式兜底判定新增一次 Codex 调用，存在慢失败或永久挂起风险。缓解：复用 CEO guardrail 的 timeout / AbortController / fail-open 语义；超时或失败记录 `fail_open`，issue job 有界完成，不阻塞后续心跳。
- 新 metadata 可能影响历史 parser。缓解：speaker 归一化只解析 `moebius:role=...`；新增测试锁定 `ceo-reviewed` 不改变 speaker。
- 状态 schema 扩展需要兼容旧 `.state`。缓解：新增字段可选，旧状态加载后缺省为空。
- 所有发布点补 metadata 可能导致测试快照更新较多。缓解：集中 helper 生成 metadata，测试只断言关键标记，避免 brittle 文本重复。
