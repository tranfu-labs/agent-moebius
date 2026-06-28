# github-issue-runner 规格

## 域定位
`github-issue-runner` 负责把 GitHub Issue 对话流转成受控的本地脚本执行：常驻进程按配置扫描目标 GitHub Issue 来源，识别最新消息中被明确艾特的本地 agent，并以受控输入把 issue 数据交给本地脚本。

当前首个运行形态是对话型 issue runner：固定盯 `tranfu-labs/agent-moebius#1`，把 `issue.body + comments` 视作一段对话历史。

## 业务规则
- MUST 作为常驻进程运行，并在启动时立即跑一轮，然后按 5 分钟间隔轮询。
- MUST 支持以对话型 issue runner 形态运行：盯单一指定 issue，把 `issue.body + comments` 视作一段对话历史。
- MUST 按 `count = 1 + comments.length` 计算消息总数，用于日志与本地脚本执行目录命名。
- MUST 支持通过 `agents/*.md` 文件名寻址 agent；`agents/<agent-name>.md` 对应 issue 消息中的 `@<agent-name>`。
- MUST 每轮只检查最新一条可见消息作为触发源：若存在 comments，最新一条 comment body 为触发源；否则 issue body 为触发源。
- MUST 仅当触发源包含至少一个已存在 agent mention 时启动本地 `codex`。
- MUST 在触发源没有有效 agent mention 时跳过，不调用 `codex`，不发表评论。
- MUST 在同一条消息包含多个有效 agent mention 时选择文本中最早出现的一个；多 agent 协作回复留作后续能力。
- MUST 允许进程重启后再次处理仍位于最新消息中的有效 agent mention；当前触发规则不依赖本地状态去重。
- MUST 把对话历史按 `\n\n` 顺序拼接为 prompt：`<selected-agent-md>\n\n<issue.body>\n\n<comment[0].body>\n\n<comment[1].body>...`。
- MUST NOT 在对话型 prompt 拼接里加入作者、时间、角色、issue 编号、链接或标题等元信息，保持 prompt 文本与 issue 上的人类阅读内容一致。
- MUST 把本地脚本（codex）的最终 assistant 文本作为新评论发回该 issue。
- MUST 从 codex JSONL stdout 中提取最终 assistant 文本；当前已知格式包括顶层 `agent_message` / `assistant_message` / `message`，以及 `item.completed` 中嵌套的 `item.type=agent_message` / `item.text`。
- MUST 把本地脚本每次执行的 stdout / stderr 落到 `<TMP_ROOT>/agent-moebius-<ISO>-c<count>/` 下，并在日志中打印该路径，便于追溯。
- MUST 在本地脚本失败（非 0 退出 / 解析不出最终消息）时只记日志、不发评论；下一轮轮询若仍满足触发条件可再次尝试。
- MUST 通过 `child_process.spawn(cmd, args[])` 调用 codex 与 gh，prompt 作为 argv 项、评论 body 通过 stdin（`gh ... --body-file -`）注入；MUST NOT 通过 shell 拼接。
- MUST 把 issue body / comment 内容当作不可信外部输入处理。
- MUST NOT 把 GitHub token 或个人访问令牌写入仓库；当前实现复用本机 `gh auth login`。
- 当前目标仓库、issue 编号、轮询间隔、本地 agent Markdown 目录、临时目录集中在 `src/config.ts`；未来通用 runner 可再扩展为环境变量或外部配置。

## 场景
### 场景 1：对话型 — issue body 艾特已存在 agent 时触发
Given `tranfu-labs/agent-moebius#1` 当前 `comments.length = 0`（仅 body）
And issue body 包含 `@product-manager`
And `agents/product-manager.md` 存在
When 一次轮询取回该 issue
Then 系统选择 `product-manager` agent，调用本机 codex 一次
And prompt 顺序为 `agents/product-manager.md` 内容、issue body
And 把 codex 最终 assistant 文本作为新评论发到该 issue
And `<TMP_ROOT>/agent-moebius-<ISO>-c1/` 下保留 codex 的 `stdout.jsonl` 与 `stderr.log`

### 场景 2：对话型 — 最新 comment 艾特已存在 agent 时触发
Given issue body 不含有效 agent mention
And 最新 comment body 包含 `@hermes-user`
And `agents/hermes-user.md` 存在
When 一次轮询取回该 issue
Then 系统选择 `hermes-user` agent，调用本机 codex 一次
And prompt 顺序为 `agents/hermes-user.md` 内容、issue body、全部 comments

### 场景 3：对话型 — 仅历史消息有 mention 时不触发
Given issue body 或较早 comment 包含 `@product-manager`
And 最新 comment body 不含有效 agent mention
When 一次轮询取回该 issue
Then 系统不调用 codex，不发评论

### 场景 4：对话型 — 未知 agent mention 不触发
Given 最新消息包含 `@unknown-agent`
And `agents/unknown-agent.md` 不存在
When 一次轮询取回该 issue
Then 系统不调用 codex，不发评论

### 场景 5：对话型 — 多个有效 mention 时选择最早出现者
Given 最新消息包含 `@hermes-user` 与 `@product-manager`
And 两个对应 agent Markdown 都存在
When 一次轮询取回该 issue
Then 系统选择文本中最早出现的有效 agent mention
And 多 agent 协作回复不在本场景实现

### 场景 6：对话型 — 重启后最新 mention 可再次触发
Given 最新消息仍包含有效 agent mention
When 进程重启并立即跑一轮
Then 系统仍可再次调用本机 codex
And 不依赖本地状态阻止重复触发

### 场景 7：对话型 — 本地脚本失败保留可追溯信息
Given codex 以非 0 退出码结束，或 stdout 中无可解析的最终 assistant 文本
When 系统处理本次结果
Then 系统在日志中记录 `event:codex-failed`、`runDir`、`reason`
And 不在 issue 发评论
And 下一轮若条件仍满足可再次尝试

### 场景 8：对话型 — 解析 codex item.completed 输出
Given codex stdout JSONL 包含 `{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}`
When 系统解析 codex 最终 assistant 文本
Then 系统识别嵌套的 `item.type=agent_message`
And 提取 `item.text` 作为待发布评论正文

### 场景 9：对话型 — issue body / comment 含 shell 特殊字符
Given issue body 或某条 comment 含 `"`、反引号、`$()`、换行
When 系统构造 prompt 并调用 codex
Then 这些字符通过 argv 传入 codex 进程，shell 不参与解析
And prompt 文本与原始 body / comment 内容字节一致

## 可验证行为
- `pnpm test` MUST 通过，覆盖对话计数、最新消息选择、agent mention 解析、agent 选择、prompt 拼接、codex jsonl 最终消息解析（含 `item.completed` 嵌套 assistant message）。
- `pnpm typecheck` MUST 通过，确保 TypeScript 严格模式下无类型错误。
- 启动真实 runner 前，运行环境 MUST 满足本机 `codex` CLI 在 `PATH` 中且已完成 `gh auth login`。
- `pnpm start` 会真实读取 `tranfu-labs/agent-moebius#1`，最新消息包含有效 agent mention 时会调用 codex 并发表评论；执行前应确认这是期望的外部副作用。
