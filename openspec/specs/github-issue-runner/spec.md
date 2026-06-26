# github-issue-runner 规格

## 域定位
`github-issue-runner` 负责把 GitHub Issue 对话流转成受控的本地脚本执行：常驻进程按配置扫描目标 GitHub Issue 来源，识别尚未响应的对话轮次，并以受控输入把 issue 数据交给本地脚本。

当前首个运行形态是对话型 issue runner：固定盯 `tranfu-labs/agent-moebius#1`，把 `issue.body + comments` 视作一段人机轮流对话。

## 业务规则
- MUST 作为常驻进程运行，并在启动时立即跑一轮，然后按 5 分钟间隔轮询。
- MUST 支持以对话型 issue runner 形态运行：盯单一指定 issue，把 `issue.body + comments` 视作一段对话历史。
- MUST 按 `count = 1 + comments.length` 计算消息总数。
- MUST 仅在 `count` 为奇数且大于已响应的最大 count 时触发一次本地脚本；同一个奇数 count 在后续轮询中不能重复触发。
- MUST 把对话历史按 `\n\n` 顺序拼接为 prompt：`<agent-md>\n\n<issue.body>\n\n<comment[0].body>\n\n<comment[1].body>...`。
- MUST NOT 在对话型 prompt 拼接里加入作者、时间、角色、issue 编号、链接或标题等元信息，保持 prompt 文本与 issue 上的人类阅读内容一致。
- MUST 把本地脚本（codex）的最终 assistant 文本作为新评论发回该 issue。
- MUST 把本地脚本每次执行的 stdout / stderr 落到 `<TMP_ROOT>/agent-moebius-<ISO>-c<count>/` 下，并在日志中打印该路径，便于追溯。
- MUST 把已响应的最大 count 持久化到本地状态文件，进程重启后不重复响应同一 count。
- MUST 在本地脚本失败（非 0 退出 / 解析不出最终消息）时只记日志、不发评论、不推进状态；下一轮轮询若仍满足触发条件可再次尝试。
- MUST 通过 `child_process.spawn(cmd, args[])` 调用 codex 与 gh，prompt 作为 argv 项、评论 body 通过 stdin（`gh ... --body-file -`）注入；MUST NOT 通过 shell 拼接。
- MUST 把 issue body / comment 内容当作不可信外部输入处理。
- MUST NOT 把 GitHub token 或个人访问令牌写入仓库；当前实现复用本机 `gh auth login`。
- 当前目标仓库、issue 编号、轮询间隔、本地 agent Markdown 路径、临时目录与状态目录集中在 `src/config.ts`；未来通用 runner 可再扩展为环境变量或外部配置。

## 场景
### 场景 1：对话型 — count 为奇数时触发
Given `tranfu-labs/agent-moebius#1` 当前 `comments.length = 0`（仅 body）
And 本地状态记录的 `maxRespondedCount = 0`
When 一次轮询取回该 issue
Then 系统计算 `count = 1`，判定为奇数且 `count > maxRespondedCount`，调用本机 codex 一次
And 把 codex 最终 assistant 文本作为新评论发到该 issue
And 把 `maxRespondedCount` 推进到 1
And `<TMP_ROOT>/agent-moebius-<ISO>-c1/` 下保留 codex 的 `stdout.jsonl` 与 `stderr.log`

### 场景 2：对话型 — count 为偶数时不触发
Given issue 当前 `comments.length = 1`（AI 已回复过）
When 轮询取回该 issue
Then `count = 2`，判定为偶数，系统不调用 codex，不发评论，不修改状态

### 场景 3：对话型 — 同一奇数 count 不重复触发
Given `maxRespondedCount = 3` 且 issue 当前 `count` 仍为 3
When 后续 5 分钟轮询继续取回该 issue
Then 系统判定 `count == maxRespondedCount`，不触发

### 场景 4：对话型 — 用户回复后下一轮再触发
Given `maxRespondedCount = 1`、issue 当前 `comments.length = 2`
When 下一轮轮询取回
Then `count = 3` 为奇数且大于 `maxRespondedCount`，触发一次
And prompt 顺序为 `agent-md \n\n issue.body \n\n comment[0].body \n\n comment[1].body`

### 场景 5：对话型 — 本地脚本失败保留可追溯信息
Given codex 以非 0 退出码结束，或 stdout 中无可解析的最终 assistant 文本
When 系统处理本次结果
Then 系统在日志中记录 `event:codex-failed`、`runDir`、`reason`
And 不在 issue 发评论，不推进 `maxRespondedCount`
And 下一轮若条件仍满足可再次尝试

### 场景 6：对话型 — issue body / comment 含 shell 特殊字符
Given issue body 或某条 comment 含 `"`、反引号、`$()`、换行
When 系统构造 prompt 并调用 codex
Then 这些字符通过 argv 传入 codex 进程，shell 不参与解析
And prompt 文本与原始 body / comment 内容字节一致

### 场景 7：重复轮询不重复执行
Given 某个奇数 count 已经触发过本地脚本并被记录为 `maxRespondedCount`
When 后续轮询仍然返回相同 count
Then 系统不再为该 count 调用本地脚本

## 可验证行为
- `pnpm test` MUST 通过，覆盖对话计数、触发判断、prompt 拼接、codex jsonl 最终消息解析、本地状态读写。
- `pnpm typecheck` MUST 通过，确保 TypeScript 严格模式下无类型错误。
- 启动真实 runner 前，运行环境 MUST 满足本机 `codex` CLI 在 `PATH` 中且已完成 `gh auth login`。
- `pnpm start` 会真实读取 `tranfu-labs/agent-moebius#1`，触发条件满足时会调用 codex 并发表评论；执行前应确认这是期望的外部副作用。
