# spec-delta: github-issue-runner

> 对 `openspec/specs/github-issue-runner/spec.md` 的 **增量**。归档时合并回 specs。

## ADD: 业务规则

- MUST 支持以**对话型 issue runner**形态运行：盯单一指定 issue（首批为 `tranfu-labs/agent-moebius#1`），把 `issue.body + comments` 视作一段对话历史。
- MUST 按 `count = 1 + comments.length` 计算消息总数；MUST 仅在 `count` 为**奇数**且大于已响应的最大 count 时触发一次本地脚本（实现去重，避免每轮重复触发）。
- MUST 把对话历史按 `\n\n` 顺序拼接为 prompt：`<agent-md>\n\n<issue.body>\n\n<comment[0].body>\n\n<comment[1].body>...`；MUST NOT 在拼接里加入作者 / 时间 / 角色等元信息（保持 prompt 文本与人类阅读一致）。
- MUST 把本地脚本（codex）的最终 assistant 文本作为新评论发回该 issue。
- MUST 把本地脚本每次执行的 stdout / stderr 落到 `<TMP_ROOT>/agent-moebius-<ISO>-c<count>/` 下，并在日志中打印该路径，便于追溯。
- MUST 把"已响应的最大 count"持久化到本地状态文件，进程重启后不重复响应同一 count。
- MUST 在本地脚本失败（非 0 退出 / 解析不出最终消息）时**只记日志、不发评论、不推进状态**，下一轮轮询若仍满足触发条件可再次尝试。
- MUST 通过 `child_process.spawn(cmd, args[], opts)` 调用 codex 与 gh，prompt 作为 argv 项、评论 body 通过 stdin（`gh ... --body-file -`）注入；MUST NOT 通过 shell 拼接。
- MUST 在常驻进程启动时立即跑一轮，然后按 5 分钟间隔轮询。

## ADD: 场景

### 场景 A：对话型 — count 为奇数时触发
Given `tranfu-labs/agent-moebius#1` 当前 `comments.length = 0`（仅 body）
And 本地状态记录的 `maxRespondedCount = 0`
When 一次轮询取回该 issue
Then 系统计算 `count = 1`，判定为奇数且 `count > maxRespondedCount` → 调用本机 codex 一次
And 把 codex 最终 assistant 文本作为新评论发到该 issue
And 把 `maxRespondedCount` 推进到 1
And `<TMP_ROOT>/agent-moebius-<ISO>-c1/` 下保留 codex 的 `stdout.jsonl` 与 `stderr.log`

### 场景 B：对话型 — count 为偶数时不触发
Given issue 当前 `comments.length = 1`（AI 已回复过）
When 轮询取回该 issue
Then `count = 2`，判定为偶数 → 系统不调用 codex，不发评论，不修改状态

### 场景 C：对话型 — 同一奇数 count 不重复触发
Given `maxRespondedCount = 3` 且 issue 当前 `count` 仍为 3
When 后续 5 分钟轮询继续取回该 issue
Then 系统判定 `count == maxRespondedCount` → 不触发

### 场景 D：对话型 — 用户回复后下一轮再触发
Given `maxRespondedCount = 1`、issue 当前 `comments.length = 2`
When 下一轮轮询取回
Then `count = 3` 为奇数且大于 `maxRespondedCount` → 触发一次；prompt 顺序为
`agent-md \n\n issue.body \n\n comment[0].body \n\n comment[1].body`

### 场景 E：对话型 — 本地脚本失败保留可追溯信息
Given codex 以非 0 退出码结束，或 stdout 中无可解析的最终 assistant 文本
When 系统处理本次结果
Then 系统在日志中记录 `event:codex-failed`、`runDir`、`reason`，不在 issue 发评论，不推进 `maxRespondedCount`；下一轮若条件仍满足可再次尝试

### 场景 F：对话型 — issue body / comment 含 shell 特殊字符
Given issue body 或某条 comment 含 `"`、反引号、`$()`、换行
When 系统构造 prompt 并调用 codex
Then 这些字符通过 argv 传入 codex 进程，shell 不参与解析；prompt 文本与原始 body / comment 内容字节一致

## MODIFY: 业务规则

- "MUST 至少能向本地脚本提供 issue 编号、链接、标题和 body" —— **对话型 runner 的 prompt 仅传 `body + comments`，不再注入编号 / 链接 / 标题**。这些元信息仍可通过日志 / runDir 文件名追溯，但 prompt 文本与人类在 issue 上看到的对话一致，避免污染模型上下文。其他 runner 形态仍按原 spec 提供。
