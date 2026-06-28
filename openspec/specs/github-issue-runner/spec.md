# github-issue-runner 规格

## 域定位
`github-issue-runner` 负责把 GitHub Issue 对话流转成受控的本地脚本执行：常驻进程按配置扫描目标 GitHub Issue 来源，识别最新消息中被明确艾特的本地 agent，并以受控输入把 issue 数据交给本地 `codex`。

当前首个运行形态是对话型 issue runner：固定盯 `tranfu-labs/agent-moebius#3`，把 issue body 与 comments 视作一条共享时间线。

## 业务规则
- MUST 作为常驻进程运行，并在启动时立即跑一轮，然后按 5 分钟间隔轮询。
- MUST 支持以对话型 issue runner 形态运行：盯单一指定 issue，把 issue body 与 comments 视作 append-only 共享时间线。
- MUST 按 `count = 1 + comments.length` 计算消息总数，用于日志与本地脚本执行目录命名；它不作为 role thread resume 的唯一上下文依据。
- MUST 支持通过 `agents/*.md` 文件名寻址 agent；`agents/<agent-name>.md` 对应 issue 消息中的 `@<agent-name>`。
- MUST 把共享时间线中的每条消息归一化为 `index`、`speaker`、`body`、`source`。
- MUST 把 issue body 归类为 `user` speaker。
- MUST 优先使用隐藏 metadata `<!-- agent-moebius:role=<role> -->` 识别 runner 生成的 agent comment；没有 metadata 但以 `<known-role>:` 开头的历史 comment SHOULD 按 legacy agent comment 兼容；其他 comment MUST 归类为 `user`。
- MUST 每轮只检查最新一条归一化消息作为触发源。
- MUST 仅当触发源包含至少一个已存在 agent mention 时启动本地 `codex`。
- MUST 在触发源没有有效 agent mention 时跳过，不调用 `codex`，不发表评论。
- MUST 在同一条消息包含多个有效 agent mention 时选择文本中最早出现的一个。
- MUST 允许同一个 issue 中多个 role 参与对话，并为每个 role 维护独立 Codex thread。
- MUST 把 role thread 状态保存在本地忽略目录 `.state/role-threads.json`，状态至少包含 issue 标识、role、threadId、lastSeenIndex。
- MUST 在首次触发某个 role 时使用该 role persona 与当前共享时间线构造 full prompt，并从 Codex JSONL 的 `thread.started.thread_id` 记录该 role 的 thread id。
- MUST NOT 使用 `--ephemeral` 执行首次 Codex run，因为 role thread 需要可 resume 的 Codex session。
- MUST 在再次触发同一 role 时使用 `codex exec resume <thread_id>`，并只把该 role 上次处理后新增、且 speaker 不是该 role 自己的消息合并成 delta prompt。
- MUST 在 3 个及以上 agent 参与同一 issue 时，保持其他 role 与用户的新增消息按共享时间线原顺序进入当前 role 的 delta prompt。
- MUST 在没有新增外部消息时跳过 resume，避免把 role 自己已在 thread 内的回复重复喂回。
- MUST 从 Codex JSONL stdout 中提取最终 assistant 文本；当前已知格式包括顶层 `agent_message` / `assistant_message` / `message`，以及 `item.completed` 中嵌套的 `item.type=agent_message` / `item.text`。
- MUST 从 Codex JSONL stdout 中提取 `thread.started.thread_id` 作为 role thread 句柄。
- SHOULD 记录 Codex JSONL 中的 `turn.completed.usage.cached_input_tokens`，用于观察 Codex resume 与模型侧 prompt caching 的收益。
- MUST 在 runner 写回 agent 评论时使用可见模板 `<role>:\n${LAST_RESPONSE}`，其中 `${LAST_RESPONSE}` 是 Codex 本轮最终 assistant 文本。
- MUST 在 runner 写回 agent 评论时追加隐藏 metadata `<!-- agent-moebius:role=<role> -->`。
- MUST 仅在 Codex 成功且 GitHub 评论成功后更新 role thread 状态；失败时 MUST 保持旧状态，允许下一轮重试。
- MUST 在 resume 失败或 thread id 不可用时允许回退到 full prompt 新建 Codex thread，并在 GitHub 评论成功后更新该 role 的 thread 映射。
- MUST 把本地脚本每次执行的 stdout / stderr 落到 `<TMP_ROOT>/agent-moebius-<ISO>-c<count>/` 下，并在日志中打印该路径，便于追溯；resume fallback 可使用独立 fallback 目录。
- MUST 在本地脚本失败（非 0 退出 / 解析不出最终消息 / 无法取得必要 thread id）时只记日志、不发评论；下一轮若条件仍满足可再次尝试。
- MUST 通过 `child_process.spawn(cmd, args[])` 调用 codex 与 gh，prompt 作为 argv 项、评论 body 通过 stdin（`gh ... --body-file -`）注入；MUST NOT 通过 shell 拼接。
- MUST 把 issue body / comment 内容当作不可信外部输入处理。
- MUST 让 prompt 构造、speaker 归一化、触发判定、delta 消息选择、评论格式化与状态更新计算保持为可单元测试的业务数据操作，不依赖 GitHub、Codex CLI 或文件系统。
- MUST NOT 把 GitHub token 或个人访问令牌写入仓库；当前实现复用本机 `gh auth login`。
- 当前目标仓库、issue 编号、轮询间隔、本地 agent Markdown 目录、临时目录、role thread 状态文件路径集中在 `src/config.ts`；未来通用 runner 可再扩展为环境变量或外部配置。

## 场景
### 场景 1：对话型 — issue body 首次艾特已存在 agent 时触发 full prompt
Given `tranfu-labs/agent-moebius#3` 当前 `comments.length = 0`（仅 body）
And issue body 包含 `@product-manager`
And `agents/product-manager.md` 存在
And `.state/role-threads.json` 中没有该 issue + role 状态
When 一次轮询取回该 issue
Then 系统选择 `product-manager` agent，调用本机 codex 一次
And prompt 包含 `agents/product-manager.md` 内容与带 speaker 的共享时间线 `#0 <user>:`
And Codex 首次执行参数不包含 `--ephemeral`
And GitHub comment 使用 `product-manager:\n${LAST_RESPONSE}` 加 `<!-- agent-moebius:role=product-manager -->`
And 评论成功后保存该 role 的 `threadId` 与 `lastSeenIndex = 0`
And `<TMP_ROOT>/agent-moebius-<ISO>-c1/` 下保留 codex 的 `stdout.jsonl` 与 `stderr.log`

### 场景 2：对话型 — 同一 role 再次被用户艾特时 resume
Given `.state/role-threads.json` 中已有 `product-manager.threadId = thread-1` 与 `lastSeenIndex = 2`
And 最新 comment body 包含 `@product-manager`
And `agents/product-manager.md` 存在
When 一次轮询取回该 issue
Then 系统使用 `codex exec resume thread-1`
And delta prompt 只包含 index 大于 2 且 speaker 不是 `product-manager` 的消息
And GitHub comment 成功后更新 `product-manager.lastSeenIndex` 到本轮共享时间线末尾

### 场景 3：对话型 — 其他 role 的公开回复进入当前 role delta prompt
Given 共享时间线中 `product-manager` 上次处理后新增了 `hermes-user` 回复与用户回复
And 最新用户回复包含 `@product-manager`
When 一次轮询取回该 issue
Then delta prompt 按共享时间线原顺序包含 `hermes-user` 与 `user` 的新增消息
And 不包含 `product-manager` 自己的新增回复

### 场景 4：对话型 — 仅历史消息有 mention 时不触发
Given issue body 或较早 comment 包含 `@product-manager`
And 最新归一化消息 body 不含有效 agent mention
When 一次轮询取回该 issue
Then 系统不调用 codex，不发评论

### 场景 5：对话型 — 未知 agent mention 不触发
Given 最新消息包含 `@unknown-agent`
And `agents/unknown-agent.md` 不存在
When 一次轮询取回该 issue
Then 系统不调用 codex，不发评论

### 场景 6：对话型 — 多个有效 mention 时选择最早出现者
Given 最新消息包含 `@hermes-user` 与 `@product-manager`
And 两个对应 agent Markdown 都存在
When 一次轮询取回该 issue
Then 系统选择文本中最早出现的有效 agent mention

### 场景 7：对话型 — resume 失败时回退 full prompt
Given `.state/role-threads.json` 中已有 `hermes-user.threadId = stale-thread`
And 最新消息包含 `@hermes-user`
When `codex exec resume stale-thread` 失败
Then 系统记录 `event:codex-resume-failed`
And 使用该 role persona 与完整共享时间线再执行一次 full prompt
And 只有 fallback Codex 成功且 GitHub 评论成功后才覆盖该 role 的 `threadId` 与 `lastSeenIndex`

### 场景 8：对话型 — 本地脚本失败保留可追溯信息
Given codex 以非 0 退出码结束，或 stdout 中无可解析的最终 assistant 文本
When 系统处理本次结果
Then 系统在日志中记录 `event:codex-failed`、`runDir`、`reason`
And 不在 issue 发评论
And 不更新 `.state/role-threads.json`
And 下一轮若条件仍满足可再次尝试

### 场景 9：对话型 — 解析 codex item.completed / thread / usage 输出
Given codex stdout JSONL 包含 `{"type":"thread.started","thread_id":"thread-1"}`
And 包含 `{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}`
And 包含 `{"type":"turn.completed","usage":{"cached_input_tokens":42}}`
When 系统解析 codex 输出
Then 系统提取 `thread-1` 作为 thread id
And 提取 `hello` 作为待发布评论正文
And 记录 `cached_input_tokens = 42`

### 场景 10：对话型 — issue body / comment 含 shell 特殊字符
Given issue body 或某条 comment 含 `"`、反引号、`$()`、换行
When 系统构造 prompt 并调用 codex
Then 这些字符通过 argv 传入 codex 进程，shell 不参与解析
And 评论正文通过 gh stdin 写入，shell 不参与解析

## 可验证行为
- `pnpm test` MUST 通过，覆盖对话计数、最新消息选择、agent mention 解析、agent 选择、speaker timeline、full/resume prompt、delta 消息选择、评论格式化、状态读写、codex jsonl 最终消息解析、thread id 解析与 cached token 解析。
- `pnpm typecheck` MUST 通过，确保 TypeScript 严格模式下无类型错误。
- 启动真实 runner 前，运行环境 MUST 满足本机 `codex` CLI 在 `PATH` 中且已完成 `gh auth login`。
- `pnpm start` 会真实读取 `tranfu-labs/agent-moebius#3`，最新消息包含有效 agent mention 时会调用 codex 并发表评论；执行前应确认这是期望的外部副作用。
