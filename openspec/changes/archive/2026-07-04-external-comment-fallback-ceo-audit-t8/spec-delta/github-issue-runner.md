# github-issue-runner spec delta

## 新增
- MUST 在 active issue 的最新外部 comment 归一化为 `speaker=user`、不带 runner 机器 metadata、且该 comment 没有合法 agent mention 时，执行一次 CEO 式无状态兜底路由判定；idle issue、issue body、runner metadata comment、已有合法 agent mention 的 comment MUST NOT 进入该兜底路由。
- MUST 让外部 comment 兜底路由只输出两类业务结果：`no_action`（无需行动）或 `append`（一条以 `ceo` role envelope 发布的追加评论）。append 正文 MUST 且只能包含一个合法可触发 agent mention；TypeScript 层 MUST 校验 JSON shape、非空 body、单 mention 和白名单，具体路由判据 MUST 放在 `agents/ceo.md`。
- MUST 按 GitHub comment id 记录每次外部 comment 兜底路由判定结果，至少包含 comment id、`outcome`（`no_action` / `append` / `fail_open`）与判定时间；同一 comment id 已有记录时 MUST NOT 再次调用兜底路由判定。
- MUST 在兜底路由判定失败、超时、非法 JSON、非法 append body 或 persona 加载失败时 fail-open：不发布评论，保持现有 no-trigger 语义，并记录 `outcome = fail_open`，避免同一 comment 重复消耗成本。
- MUST 在兜底路由发布 append 成功后，让该 comment 成为下一轮 active poll 的最新消息，并由普通 mention trigger 在下一轮选择目标 agent；本轮 MUST NOT 直接运行 append 中 mention 的目标 agent。
- MUST 让所有 runner 发布路径的评论 body 带可审计 CEO 覆盖标记，例如 `<!-- moebius:ceo-reviewed action=... -->`；实际调用 CEO 的评论 MUST 标明 CEO 结果，不实际调用 CEO 的系统错误评论 / dead-letter / 路由 append MUST 标明 bypass 或 not-applicable reason。
- MUST 保留 `<!-- moebius:ceo-corrected -->` 作为 CEO replace / append 修正的子类标记；MUST NOT 再把它作为“是否经过 CEO 审阅”的唯一信号。
- MUST 让 `agents/ceo.md` 承载外部无 mention 评论的路由判据：有明确下一步控制权移交意图时输出 append；没有明确路由意图或不确定时输出 no_action。
- MUST 让 `.state/github-response-intake.json` 的新增兜底路由记录字段兼容旧状态文件；缺失字段 MUST 按空记录处理。

## 修改
- MUST 让 `github-response-intake` 继续保持纯业务状态模块：它只记录 external comment fallback route outcome，不调用 GitHub、Codex、文件系统或读取 agent persona。
- MUST 让 `src/triggers/` 保持普通 mention trigger 职责；active-only、comment id 防重与 CEO 式兜底路由编排由 runner no-trigger 分支承载。
- MUST 让 CEO 覆盖审计标记不影响 speaker 归一化；`speaker` 仍只由 `moebius:role=<role>` metadata 或 legacy role envelope 决定。

## 场景
### 场景：active issue 最新外部无 mention 评论触发一次兜底路由
Given issue 处于 active mode
And 最新 GitHub comment 没有 `moebius:role` metadata
And 最新 GitHub comment 没有其他 `moebius:*` 机器 metadata
And 归一化后最新 timeline message 为 `speaker=user`
And 最新 comment body 没有合法 agent mention
And intake state 尚未记录该 comment id 的 fallback route decision
When runner 处理该 issue
Then runner MUST 调用 CEO 式 external comment route 判定一次
And 判定结果 MUST 记录到 intake state，key 为该 comment id

### 场景：兜底路由 no_action 不发评论且不重复
Given active issue 最新外部无 mention comment 已触发兜底路由
And CEO 式路由返回 `{"action":"no_action"}`
When runner 完成本轮处理
Then runner MUST NOT 发布新评论
And issue processing outcome 按 no-trigger 折叠
And intake state MUST 记录该 comment id 的 `outcome = no_action`
When 下一轮处理同一 comment id
Then runner MUST NOT 再调用 external comment route 判定

### 场景：兜底路由 append 以 ceo envelope 发布并留给下一轮触发
Given active issue 最新外部无 mention comment 有明确路由意图
And CEO 式路由返回 `{"action":"append","body":"@dev 请继续处理已通过验收后的实现。"}`
When runner 完成本轮处理
Then runner MUST 发布一条 `<ceo>:` envelope comment
And comment body MUST 包含 `<!-- moebius:role=ceo -->`
And comment body MUST 包含 `<!-- moebius:ceo-reviewed ... -->`
And intake state MUST 记录该 comment id 的 `outcome = append` 与 `targetRole = dev`
And 本轮 MUST NOT 直接运行 dev
When 下一轮 active poll 读取到该 CEO comment
Then 普通 mention trigger MUST 选择 `dev`

### 场景：兜底路由 fail-open 记录失败并保持现状
Given active issue 最新外部无 mention comment 尚未判定
And external comment route 判定超时、Codex 失败、persona 加载失败、非法 JSON、append body 无 mention、多 mention 或 mention 非白名单
When runner 完成本轮处理
Then runner MUST NOT 发布新评论
And issue processing outcome 按 no-trigger 折叠
And intake state MUST 记录该 comment id 的 `outcome = fail_open` 与失败原因
And 同一 comment id 后续 MUST NOT 重复判定

### 场景：idle issue 不触发兜底路由
Given issue 不处于 active mode
And 最新外部 comment 没有合法 agent mention
When runner 处理该 issue
Then runner MUST NOT 调用 external comment route 判定
And runner MUST 保持现有 no-trigger 行为

### 场景：runner metadata comment 不触发兜底路由
Given active issue 的最新 comment 归一化为 `speaker=user`
And 最新 comment 含 `<!-- moebius:dead-letter -->` 或其他 `moebius:*` 机器 metadata
When runner 处理该 issue
Then runner MUST NOT 调用 external comment route 判定
And runner MUST 保持现有 no-trigger 行为

### 场景：runner 发布的 agent 评论可审计 CEO no_change
Given dev Codex run 成功
And CEO guardrail 返回 `{"action":"no_change"}`
When runner 发布 dev comment
Then comment body MUST 包含 `<!-- moebius:role=dev -->`
And comment body MUST 包含 `<!-- moebius:ceo-reviewed action=no_change -->`
And comment body MUST NOT 包含 `<!-- moebius:ceo-corrected -->`

### 场景：CEO append 修正保留 corrected 且补 reviewed
Given dev Codex run 成功
And CEO guardrail 返回 `{"action":"append","as":"ceo","body":"@qa 请审查方案。"}`
When runner 发布评论
Then 原 dev comment MUST 包含 `ceo-reviewed` 标记，表示 CEO action 为 append original
And 追加的 ceo comment MUST 包含 `<!-- moebius:role=ceo -->`
And 追加的 ceo comment MUST 包含 `ceo-reviewed` 标记
And 追加的 ceo comment MUST 继续包含 `<!-- moebius:ceo-corrected -->`

### 场景：未调用 CEO 的系统评论显式标注 bypass 或 not-applicable
Given 媒体准备失败、artifact 发布失败或 dead-letter 发布路径产生可见评论
When runner 发布该评论
Then comment body MUST 包含 `<!-- moebius:ceo-reviewed action=bypass ... -->` 或 `<!-- moebius:ceo-reviewed action=not_applicable ... -->`
And body MUST 说明未实际调用 CEO 的可审计原因

### 场景：ceo-reviewed metadata 不影响 speaker 归一化
Given GitHub comment body 同时包含 `<!-- moebius:role=product-manager -->` 与 `<!-- moebius:ceo-reviewed action=no_change -->`
When runner 构造 shared timeline
Then 该 message 的 speaker MUST 仍为 `product-manager`
And timeline body MUST NOT 因 `ceo-reviewed` metadata 被识别为其他 role

### 场景：T8 取证结论限制修复范围
Given issue 41 上存在相隔 19 秒与 44 秒的 product-manager 相反结论对
And 当前可读 `.state/*`、`/tmp/moebius-*` runDir 与仓库内日志均不能证明对应 PM Codex run 来源
When 打开本 change 的 `design.md`
Then 必须看到取证结论为“其他：原始日志不可得，基于现有 issue metadata 与本地可读运行产物无法证明双实例 / 伪装 / 误读之一”
And 必须看到修复范围裁剪为 T8 明确范围，不回灌 T1 进程级防重或 T2 协议约束

### 场景：active issue 由 idle scan changed job 命中时仍触发兜底
Given intake state 中某 issue 已处于 active mode
And idle repository scan 也发现该 issue updatedAt changed
And 同一轮按 issueKey 去重后以 changed job 处理该 issue
And 最新外部 comment 没有合法 agent mention
When runner 处理该 issue
Then runner MUST 仍按处理前 intake state 识别 active-only 语义
And MUST 执行一次外部 comment 兜底路由判定

### 场景：外部 route parser 非法 append fail-open
Given external comment route 返回 append
And append body 为空、没有合法 mention、含多个合法 mention、mention 未知 role、mention `@ceo`、或合法 mention 只出现在 fenced code / inline code 中
When TypeScript 后置校验 route 输出
Then route result MUST 为 `FAIL_OPEN`
And runner MUST NOT 发布 append 评论
And intake state MUST 记录该 comment id 的 `outcome = fail_open`

### 场景：兜底路由调用有界完成
Given active issue 最新外部无 mention comment 触发 external comment route
And 该 route 的 Codex 调用超时、拒绝或慢失败
When runner 处理该 issue
Then issue job MUST 有界完成
And 后续 heartbeat MUST NOT 被该 route 调用永久阻塞
And intake state MUST 记录该 comment id 的 `outcome = fail_open`
And 同一 comment id MUST NOT 重复刷屏或重复消耗 route 判定

### 场景：旧 intake state 缺少 route 字段仍兼容
Given `.state/github-response-intake.json` 中某 active issue 只有 T8 前字段
And 缺少 external comment fallback route 记录字段
When runner 加载 state 并处理该 issue
Then 缺失字段 MUST 按空 route 记录处理
And 后续 outcome 折叠 MUST 保留既有 issue state 语义
