# github-issue-runner 规格

## 域定位
`github-issue-runner` 负责把 GitHub Issue 对话流转成受控的本地脚本执行：常驻进程按本地配置扫描白名单 GitHub repository 的 open issue 更新，通过独立触发器识别最新消息中的 agent mention 或 stage metadata，并以受控输入把 issue 数据交给本地 `codex` 或发布确定性 hook 评论。

当前运行形态是多 repository 轮询的对话型 issue runner：提交版 `config.toml` 只作为示例，代码默认白名单为空；本机可通过被忽略的 `config.local.toml` 配置 watched repositories。每个被处理的 issue 都把 issue body 与 comments 视作一条共享时间线。

## 业务规则
- MUST 作为常驻进程运行，并在启动时立即跑一轮，然后按配置的 tick 间隔轮询；默认 tick 间隔为 1 分钟，用于承载 active issue 轮询。
- MUST 支持以对话型 issue runner 形态运行：每个被处理的 issue 都把 issue body 与 comments 视作 append-only 共享时间线。
- MUST 支持 watch 多个配置的 GitHub repositories，且不要求 webhook endpoint。
- MUST 把 GitHub response intake 业务规则与外部 GitHub / 文件系统 adapter 分离。
- MUST 让 issue source discovery 与轮询节奏位于 conversation、trigger、prompt、Codex 与 role-thread state 模块之外。
- MUST 默认 watched repository list 为空。
- MUST 提供提交版 `config.toml` 默认示例文件，包含注释化 repository 白名单示例。
- MUST 从项目根目录 `config.local.toml` 读取本地 repository 白名单覆盖配置。
- MUST 把 `config.local.toml` 视为本地专用文件，并通过 git ignore 排除。
- MUST 使用 TOML 解析 `config.toml` 与 `config.local.toml`。
- MUST 在 `config.toml` 或 `config.local.toml` 存在但无法解析或 shape 不合法时 fail fast。
- MUST 允许纯注释或缺少 `watchRepositories` 的 TOML 配置解析为空 repository 白名单。
- MUST 要求每个 configured repository entry 包含非空 `owner` 与 `repo` 字符串。
- MUST 将本地配置文件读取与本地配置 shape 校验分离，使 shape 校验可单元测试。
- MUST 默认在 idle mode 下每 5 分钟扫描一次每个白名单 repository。
- MUST 在 idle repository scan 中只扫描有界的最近更新 open issue 窗口；默认每个 repository 20 个 issues。
- MUST 使用 GitHub issue `updatedAt` 作为 repository summary 与 active issue poll 的主要变更检测依据。
- MUST 在拉取 issue body/comments 时同时读取 GitHub `state` 字段（`OPEN` / `CLOSED`），并作为 `GitHubIssue` shape 的必填字段。
- MUST 默认在 repository 首次 baseline scan 时只记录历史 open issue 的 `updatedAt`，不批量处理历史 issue，避免对旧 mention 批量回复。
- SHOULD 支持显式配置 seed issue sources，用于需要启动后立即检查的特定 issue。
- MUST 仅在 issue 出现 runner-relevant 变化并成功处理后把该 issue 提升为 active mode。
- MUST 默认每 1 分钟轮询 active issues。
- MUST 仅轮询当前 watched repositories 内的 active issues。
- MUST 在 active issue 连续 5 次 active poll 未观察到 GitHub `updatedAt` 变化后，将该 issue 降级回 idle。
- MUST 在 active issue 观察到新 `updatedAt` 且成功处理后重置无变化计数。
- MUST 在 active issue 观察到 `no-trigger` 变化时保持 active，重置无变化计数，并安排下一次 active poll。
- MUST 在 active poll 或 idle-scan changed-issue 处理路径中发现 issue `state = CLOSED` 时，把该 issue 从 `.state/github-response-intake.json` 移除（与 `issue-not-found` 语义一致），不调用 trigger、不调用 Codex、不发评论；MUST 记录 `event = "skip"`、`reason = "issue-closed"` 与 `issueKey`。
- MUST 限制当前 watched repositories 内的 active issues 数量；超出上限时，runner MUST 将多余 issue 降级到 idle 并记录原因。
- MUST 把 GitHub response intake 状态保存在本地忽略目录 `.state/github-response-intake.json`，状态至少包含 repository idle scan 时间、issue `updatedAt`、mode、active 无变化计数和下次轮询时间。
- MUST 在 `no-trigger` 与 `failed` 后更新 intake state，避免未变化或持续失败的 issue 被每 tick 重复 fetch / process。
- MUST 在单 issue 处理返回 `failed` 时把该 issue 的 `updatedAt` 同步为刚拉取的最新值、`activeNoChangeCount` 累加 1、`nextPollAt` 设为处理时间后 `activeIssuePollIntervalMs`；一旦累加到 `activeIssueNoChangeLimit`，MUST 立即把 `mode` 降为 `idle` 并把 `nextPollAt` 设为 `null`。
- MUST NOT 在 pre script 执行、Codex 执行或 GitHub comment 发布失败时推进 role-thread 状态或发布 GitHub 评论；失败时仅推进 intake `updatedAt` / `activeNoChangeCount` / `nextPollAt`，确保轮询能收敛降级。
- MUST 在配置的目标 issue 暂不可解析时把本轮视为可恢复 skip，记录 `reason = "issue-not-found"` 与 `issueKey`，并等待后续轮询。
- MUST 在目标 issue 不存在或已关闭时不调用 Codex、不发表评论，并从 intake active 状态中移除或降级该 issue。
- MUST 继续把非 issue-not-found 的 GitHub CLI 失败视作可恢复错误；若本轮没有成功取得 latest `updatedAt`，MUST 保留原 `updatedAt`，但仍按 `failed` 规则推进 `activeNoChangeCount` 与 `nextPollAt`，确保 fetch 失败也不会每 tick 刷屏。
- MUST 按 `count = 1 + comments.length` 计算消息总数，用于日志与本地脚本执行目录命名；它不作为 role thread resume 的唯一上下文依据。
- MUST 支持通过 `agents/*.md` 文件名寻址 agent；`agents/<agent-name>.md` 对应 issue 消息里的普通 `@<agent-name>` mention 触发方式。
- MUST 将 agent 触发决策封装为独立触发器；runner 只消费触发器结果，不把具体触发方式写死在编排流程中。
- MUST 保留 mention trigger：最新消息包含已存在 agent mention 时，触发对应 agent。
- MUST 提供 `agents/reflector.md` 作为通用反思接力展示身份。
- MUST NOT 通过普通 `@reflector` mention 启动 Codex reflector；reflector 的触发方式是 stage metadata。
- MUST 支持 reflector stage trigger：最新非 `reflector` agent 消息包含 `<!-- agent-moebius:stage=<stage> -->` 且 stage 在白名单内时，runner 直接发布 reflector 评论。
- MUST 支持 `plan-written` 与 `code-verified` 两个 reflector stage。
- MUST NOT 将 `plan-confirmed` 与 `code-complete` 视为受支持的 reflector stage。
- MUST 让 reflector stage trigger 生成的评论包含 `<!-- agent-moebius:role=reflector -->` 与 `<!-- agent-moebius:stage-hook source=<role> stage=<stage> sourceIndex=<index> -->` metadata。
- MUST 对同一 issue timeline 中同一 `(source, stage)` 累计发布的 stage hook 评论数限制为 `MAX_SELF_REFLECT` 次；重复防护基于共享时间线中的 `stage-hook` metadata 中的 `source` 与 `stage` 字段（`sourceIndex` 仅用于人 / 日志追溯，不参与去重）。
- MUST 在发布同一 `(source, stage)` 的最后一次自动反思 hook 时追加收敛指令：若没有发现新问题，源 agent 不应继续输出同一个 stage marker，而应直接按推进计划进入后续步骤；若发现新问题，源 agent 应说明问题与建议处理方式，然后停下等待人类检查，不自动推进。
- MUST NOT 对 `reflector` 自己的消息触发 reflector stage trigger。
- MUST 让 `reflector` 只提醒输出 stage 的 agent 进行反思，不接管需求、方案、实现、测试或归档工作。
- MUST 在每个 issue 处理周期内，agent 通过 mention trigger 完成 codex 评论 post 后立即把该评论拼回本地 timeline，并再次调用 trigger 解析；NEVER 仅依赖跨轮 active poll 触发 reflector stage hook。
- MUST 仅在自反时再次解析命中 reflector stage hook（`kind === "post-comment"`）时继续自反并直接发布 hook 评论；若再次解析命中 mention（`kind === "run-agent"`），MUST 停止自反、将该 mention 留给下一轮 active poll 处理。
- MUST 限制同轮自反次数为 `MAX_SELF_REFLECT = 3`；达到上限即停止本轮自反、留给下一轮 active poll。
- MUST 在自反循环中复用 `resolveReflectorStageTrigger` 既有的 stage-hook 去重逻辑（同 `(source, stage)` 累计 < `MAX_SELF_REFLECT`），NEVER 为已达上限的 (source, stage) 再次发布 hook 评论。
- MUST 保留每分钟 active poll 与 5 次无变化降级 idle 的现有节奏；自反失败或外部 actor 写带 stage marker 评论时，下一轮 active poll 仍负责兜底。
- MUST 在自反每一步发布 hook 评论时记录 `event = "self-reflect-hook-commented"`、`iteration`、`stage`、`sourceRole`、`sourceIndex` 与 `issueKey`；自反停止时记录 `event = "self-reflect-stopped"`、`iteration`、`reason`、`issueKey`。
- MUST 在自反循环中拼接本地 timeline 时使用 `formatAgentComment` 包过的 agent 评论 body（与 GitHub 实际写回的 comment body 一致），保证 `normalizeComment` 与 stage marker 解析在自反时与跨轮 poll 时行为一致。
- MUST 把 `MAX_SELF_REFLECT` 与现有 tick / poll 参数一同写入启动日志的 `CONFIG_LOG_FIELDS`。
- MUST 支持 agent Markdown frontmatter 声明受信任 `preScript`，用于 runner 在 Codex 执行前准备上下文；Markdown 正文仍作为 persona 文本输入 Codex。
- MUST 将 `preScript` 路径限制在仓库内 `src/agent-prescripts/` 的静态 registry 中；issue body/comment 内容不得成为可执行脚本路径。
- MUST 把共享时间线中的每条消息归一化为 `index`、`speaker`、`body`、`source`。
- MUST 把 issue body 归类为 `user` speaker。
- MUST 优先使用隐藏 metadata `<!-- agent-moebius:role=<role> -->` 识别 runner 生成的 agent comment；没有 metadata 但以 `<known-role>:`、`&lt;known-role&gt;:` 或 raw `<known-role>:` 开头的历史 comment SHOULD 按 legacy agent comment 兼容；其他 comment MUST 归类为 `user`。
- MUST 每轮只检查最新一条归一化消息作为触发源，并由触发器决定是运行 agent、发布 hook 评论还是跳过。
- MUST 仅当触发源包含至少一个已存在 agent mention 时启动本地 `codex`。
- MUST 在触发源没有有效 trigger 时跳过，不调用 `codex`，不发表评论。
- MUST 在同一条消息包含多个有效 agent mention 时选择文本中最早出现的一个。
- MUST 在选中 agent 且本轮需要调用 Codex 时先执行该 agent 声明的 pre script；pre script 失败时 MUST 跳过 Codex、跳过 GitHub 评论、保持 role thread 状态不变。
- MUST 在 mention trigger 选中可运行 agent、prompt plan 需要执行、且该 agent 的 preScript 已成功完成后，在首次调用 Codex driver 前为当前 GitHub issue 添加 `eyes` reaction。
- MUST 仅在真实 Codex driver 执行路径添加该 reaction；no-trigger、deterministic stage hook、preScript 失败、prompt plan skip、Codex 不会启动的路径 MUST NOT 添加该 reaction。
- MUST 在同一个 issue 处理周期中最多添加一次 Codex execution reaction；resume 失败后 fallback full run MUST NOT 再添加第二次 reaction。
- MUST 在 Codex execution reaction 添加成功时记录结构化日志，至少包含 `event = "codex-execution-reaction-added"`、`issueKey` 与 `agent`。
- MUST 在 Codex execution reaction 添加失败时记录结构化日志，至少包含 `event = "codex-execution-reaction-failed"`、`issueKey`、`agent` 与错误原因，并继续执行 Codex；reaction 失败本身 MUST NOT 推进或阻断 role thread 状态。
- MUST 支持 `dev` pre script 基于 runner 当前处理的 GitHub issue source（owner、repo、issueNumber）准备 Codex 工作目录，而不是解析 issue body/comment 中的链接。
- MUST 为每个 source issue 创建并复用一个 `dev` issue 独占 worktree；不同 source issue 即使属于同一个 repo 也 MUST 使用不同 worktree。
- MUST 允许同一 repository 的多个 issue worktree 复用本地 bare repo cache，但 MUST 保持 worktree 彼此隔离。
- MUST 在新建或复用 `dev` issue worktree 前刷新目标仓库远端 `main` tracking ref。
- MUST 从已刷新的远端 `main` tracking ref 创建新的 `dev` issue worktree；MUST NOT 依赖本地 bare repo 的 `HEAD` 作为新 worktree 基线。
- MUST 在复用已有 `dev` issue worktree 前检查当前 worktree `HEAD` 是否包含最新远端 `main`。
- MUST 在已有 `dev` issue worktree 落后最新远端 `main` 时先强制删除该 worktree（`git worktree remove --force`；失败时 fallback 到 `rm -rf` + `git worktree prune`），再从 `refs/remotes/origin/main` 重建；重建成功后继续以同一路径作为 Codex cwd，并保持原 agent context state。
- MUST 在 stale worktree 重建过程任一步失败时 fail closed，不调用 Codex、不发表评论、不推进 role thread 状态，并返回 `stale-worktree-rebuild-failed:<detail>`。
- MUST 在 stale worktree 自动重建过程中丢弃 worktree 内未推送的本地 commit；agent 产出的落地口径是 commit + push，未 push 的改动不属于要保护的运行时状态。
- MUST 在已有 `dev` context 指向缺失或不可访问 worktree 时 fail closed，不自动重建。
- MUST 允许同一个 issue 中多个 role 参与对话，并为每个 role 维护独立 Codex thread。
- MUST 把 role thread 状态保存在本地忽略目录 `.state/role-threads.json`，状态至少包含 issue 标识、role、threadId、lastSeenIndex。
- MUST 把 agent pre script 上下文保存在本地忽略目录 `.state/agent-contexts.json`，状态至少包含 issue、role、preScript、目标仓库、worktreePath、preparedFromMessageIndex。
- MUST 在首次触发某个 role 时使用该 role persona 与当前共享时间线构造 full prompt，并从 Codex JSONL 的 `thread.started.thread_id` 记录该 role 的 thread id。
- MUST NOT 使用 `--ephemeral` 执行首次 Codex run，因为 role thread 需要可 resume 的 Codex session。
- MUST 在再次触发同一 role 时使用 `codex exec resume <thread_id>`，并只把该 role 上次处理后新增、且 speaker 不是该 role 自己的消息合并成 delta prompt。
- MUST 在 3 个及以上 agent 参与同一 issue 时，保持其他 role 与用户的新增消息按共享时间线原顺序进入当前 role 的 delta prompt。
- MUST 在没有新增外部消息时跳过 resume，避免把 role 自己已在 thread 内的回复重复喂回。
- MUST 从 Codex JSONL stdout 中提取最终 assistant 文本；当前已知格式包括顶层 `agent_message` / `assistant_message` / `message`，以及 `item.completed` 中嵌套的 `item.type=agent_message` / `item.text`。
- MUST 从 Codex JSONL stdout 中提取 `thread.started.thread_id` 作为 role thread 句柄。
- SHOULD 记录 Codex JSONL 中的 `turn.completed.usage.cached_input_tokens`，用于观察 Codex resume 与模型侧 prompt caching 的收益。
- MUST 在 pre script 返回 Codex 工作目录时，以显式 `cwd` 调用 Codex。
- MUST 在 runner 写回 agent 评论时使用 GitHub 页面可见模板 `<role>:\n${LAST_RESPONSE}`，其中 `${LAST_RESPONSE}` 是 Codex 本轮最终 assistant 文本；落到 comment body 时 MUST 使用 `&lt;role&gt;:\n${LAST_RESPONSE}`，避免 GitHub Markdown 把 raw `<role>` 当作 HTML 标签处理。
- MUST 在 runner 写回 agent 评论时追加隐藏 metadata `<!-- agent-moebius:role=<role> -->`。
- MUST 仅在 Codex 成功且 GitHub 评论成功后更新 role thread 状态；失败时 MUST 保持旧状态，允许下一轮重试。
- MUST 在 resume 失败或 thread id 不可用时允许回退到 full prompt 新建 Codex thread，并在 GitHub 评论成功后更新该 role 的 thread 映射。
- MUST 把本地脚本每次执行的 stdout / stderr 落到 `<TMP_ROOT>/agent-moebius-<ISO>-c<count>/` 下，并在日志中打印该路径，便于追溯；resume fallback 可使用独立 fallback 目录。
- MUST 在本地脚本失败（非 0 退出 / 解析不出最终消息 / 无法取得必要 thread id）时只记日志、不发评论；下一轮若条件仍满足可再次尝试。
- MUST 通过 `child_process.spawn(cmd, args[])` 调用 codex 与 gh，prompt 作为 argv 项、评论 body 通过 stdin（`gh ... --body-file -`）注入，issue reaction 通过 `gh api` argv 参数数组添加；MUST NOT 通过 shell 拼接。
- MUST 把 issue body / comment 内容当作不可信外部输入处理。
- MUST 让 prompt 构造、speaker 归一化、触发判定、delta 消息选择、评论格式化与状态更新计算保持为可单元测试的业务数据操作，不依赖 GitHub、Codex CLI 或文件系统。
- MUST NOT 把 GitHub token 或个人访问令牌写入仓库；当前实现复用本机 `gh auth login`。
- 当前 watched repositories 来自 `config.toml` 与 `config.local.toml`；tick 间隔、idle repo scan 间隔、active issue poll 间隔、issue scan limit、active issue 上限、本地 agent Markdown 目录、临时目录、role thread 状态文件路径、agent context 状态文件路径、GitHub response intake 状态文件路径、默认 workdir root 集中在 `src/config.ts`。
- MUST 在启动日志中打印 config path、local config path、resolved watched repositories、tick 间隔、idle/active 轮询参数、issue scan limit、active issue 上限与解析后的默认 workdir root。

## 场景
### 场景 0：本地配置 — 没有本机覆盖时默认不监听 repository
Given 项目根目录 `config.toml` 只包含注释示例
And 项目根目录不存在 `config.local.toml`
When runner 加载启动配置
Then watched repositories 为空数组
And 本轮不会扫描任何 GitHub repository

### 场景 0.1：本地配置 — config.local.toml 配置 repository 白名单
Given 项目根目录 `config.local.toml` 内容为：
```toml
[[watchRepositories]]
owner = "tranfu-labs"
repo = "tranfu-agents-app"

[[watchRepositories]]
owner = "tranfu-labs"
repo = "agent-moebius"
```
When runner 加载启动配置
Then watched repositories 包含 `tranfu-labs/tranfu-agents-app`
And watched repositories 包含 `tranfu-labs/agent-moebius`
And `config.local.toml` 不应被 git 跟踪

### 场景 1：对话型 — issue body 首次艾特已存在 agent 时触发 full prompt
Given `tranfu-labs/agent-moebius#4` 当前 `comments.length = 0`（仅 body）
And issue body 包含 `@product-manager`
And `agents/product-manager.md` 存在
And `.state/role-threads.json` 中没有该 issue + role 状态
When 一次轮询取回该 issue
Then 系统选择 `product-manager` agent，调用本机 codex 一次
And prompt 包含 `agents/product-manager.md` 内容与带 speaker 的共享时间线 `#0 <user>:`
And Codex 首次执行参数不包含 `--ephemeral`
And GitHub comment body 使用 `&lt;product-manager&gt;:\n${LAST_RESPONSE}` 加 `<!-- agent-moebius:role=product-manager -->`，页面可见为 `<product-manager>:\n${LAST_RESPONSE}`
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

### 场景 7：通用反思者 — agent 输出 stage 时触发反思接力
Given 最新消息 speaker 是 `dev`
And 最新消息 body 包含 `<!-- agent-moebius:stage=plan-written -->`
And `agents/reflector.md` 存在
And 同一 issue timeline 中同 `(source=dev, stage=plan-written)` 累计 hook 数小于 `MAX_SELF_REFLECT`
When 一次轮询取回该 issue
Then reflector stage trigger 直接发布 `reflector` 评论
And comment body 包含 `@dev 请针对「plan-written」做一次反思。`
And comment body 包含 `<!-- agent-moebius:role=reflector -->`
And comment body 包含 `<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=<latest-index> -->`
And 若这是同一 `(source=dev, stage=plan-written)` 的最后一次自动反思 hook，comment body 包含“这是该阶段最后一次自动反思”
And 最后一次自动反思 hook 要求没有新问题时直接按推进计划进入后续步骤
And 最后一次自动反思 hook 要求发现新问题时说明问题并停下等待人类检查
And 系统不调用 Codex reflector

### 场景 8：通用反思者 — 普通 @reflector mention 不启动 Codex
Given 最新消息 body 只包含 `@reflector`
And `agents/reflector.md` 存在
When 一次轮询取回该 issue
Then 系统不调用 Codex reflector
And 不发布 reflector hook 评论

### 场景 9：通用反思者 — reflector hook 评论继续触发源 agent
Given 最新消息 speaker 是 `reflector`
And 最新消息 body 包含 `@dev`
And 最新消息 body 包含 `<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=1 -->`
When 一次轮询取回该 issue
Then mention trigger 选择 `dev`
And 系统按 `dev` role thread 执行 Codex

### 场景 10：对话型 — resume 失败时回退 full prompt
Given `.state/role-threads.json` 中已有 `hermes-user.threadId = stale-thread`
And 最新消息包含 `@hermes-user`
When `codex exec resume stale-thread` 失败
Then 系统记录 `event:codex-resume-failed`
And 使用该 role persona 与完整共享时间线再执行一次 full prompt
And 只有 fallback Codex 成功且 GitHub 评论成功后才覆盖该 role 的 `threadId` 与 `lastSeenIndex`

### 场景 11：对话型 — 本地脚本失败保留可追溯信息
Given codex 以非 0 退出码结束，或 stdout 中无可解析的最终 assistant 文本
When 系统处理本次结果
Then 系统在日志中记录 `event:codex-failed`、`runDir`、`reason`
And 不在 issue 发评论
And 不更新 `.state/role-threads.json`
And 下一轮若条件仍满足可再次尝试

### 场景 12：对话型 — 解析 codex item.completed / thread / usage 输出
Given codex stdout JSONL 包含 `{"type":"thread.started","thread_id":"thread-1"}`
And 包含 `{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}`
And 包含 `{"type":"turn.completed","usage":{"cached_input_tokens":42}}`
When 系统解析 codex 输出
Then 系统提取 `thread-1` 作为 thread id
And 提取 `hello` 作为待发布评论正文
And 记录 `cached_input_tokens = 42`

### 场景 13：对话型 — issue body / comment 含 shell 特殊字符
Given issue body 或某条 comment 含 `"`、反引号、`$()`、换行
When 系统构造 prompt 并调用 codex
Then 这些字符通过 argv 传入 codex 进程，shell 不参与解析
And 评论正文通过 gh stdin 写入，shell 不参与解析

### 场景 14：对话型 — 配置的目标 issue 暂不存在
Given 配置的目标 issue number 在 GitHub 中暂不可解析
When 一次轮询读取 issue
Then 系统记录 `event = "skip"` 与 `reason = "issue-not-found"`
And 不调用 Codex
And 不发表评论
And 不更新本地状态

### 场景 15：Dev agent — 首次触发创建 issue 独占 worktree
Given 最新消息包含 `@dev`
And `agents/dev.md` frontmatter 声明 `preScript: src/agent-prescripts/dev-workspace.ts`
And `.state/agent-contexts.json` 中没有当前 issue + `dev` context
When 一次轮询取回该 issue
Then 系统基于当前 issue source 计算 clone URL 与 issue 独占 worktree 路径
And 在 `<WORKDIR_ROOT>/repos/` 下准备 bare repo cache
And 在 `<WORKDIR_ROOT>/worktrees/` 下创建当前 issue 的 `dev` worktree
And 以该 worktree 作为 Codex cwd 执行本轮
And 保存 `.state/agent-contexts.json`

### 场景 16：Dev agent — 后续触发复用已有 worktree
Given `.state/agent-contexts.json` 中已有当前 issue + `dev` context
And 该 context 的 worktreePath 可访问
When 最新消息再次包含 `@dev`
Then 系统不重复 clone，不重复创建 worktree
And 以已记录 worktreePath 作为 Codex cwd 执行 resume 或 fallback full run

### 场景 16.1：Dev agent — 已有 worktree 落后最新 main 时自动重建
Given `.state/agent-contexts.json` 中已有当前 issue + `dev` context
And 该 context 的 worktreePath 可访问
And 该 worktree 的 `HEAD` 不包含最新 `refs/remotes/origin/main`
When 最新消息再次包含 `@dev`
Then 系统先 `git worktree remove --force` 旧 worktree
And 若 remove 失败则 fallback 到 `rm -rf` 旧路径并执行 `git worktree prune`
And 系统从 `refs/remotes/origin/main` 重建同一路径 worktree
And 返回 `{ ok: true, codexCwd: <worktreePath> }`
And 保留原 agent context state

### 场景 16.2：Dev agent — stale worktree 重建失败时 fail closed
Given `.state/agent-contexts.json` 中已有当前 issue + `dev` context
And 该 context 的 worktreePath 可访问但落后最新 `refs/remotes/origin/main`
And 删除旧 worktree、prune、重新 add worktree 或 access 断言任一步失败
When 最新消息再次包含 `@dev`
Then 系统返回 `{ ok: false, reason = "stale-worktree-rebuild-failed:<detail>" }`
And 不调用 Codex
And 不发表评论
And 不更新 `.state/role-threads.json`

### 场景 17：Dev agent — worktree 缺失时 fail closed
Given `.state/agent-contexts.json` 中已有当前 issue + `dev` context
And 该 context 的 worktreePath 不存在或不可访问
When 最新消息包含 `@dev`
Then 系统记录 pre script 失败
And 不调用 Codex
And 不发表评论
And 不更新 `.state/role-threads.json`

### 场景 18：GitHub response intake — 首次 repository scan 只建立 baseline
Given `.state/github-response-intake.json` 中没有 `tranfu-labs/agent-moebius` repository 状态
When 一次 tick 扫描该 repository 的最近 open issues
Then 系统记录该 repository 的 `lastIdleScanAt`
And 为 scan 返回的 issue 记录当前 `updatedAt`
And 不读取这些历史 issue 的完整 body/comments
And 不调用 Codex
And 不发表评论

### 场景 19：GitHub response intake — idle repository scan 发现 issue 更新后处理
Given `.state/github-response-intake.json` 中已有 `tranfu-labs/agent-moebius#4.updatedAt = T1`
And idle repository scan 返回 `tranfu-labs/agent-moebius#4.updatedAt = T2`
When 系统读取该 issue body/comments 且最新消息包含有效 agent mention
Then 系统按该 issue source 运行单 issue 处理流水线
And 评论成功后把该 issue 记录为 `mode = active`
And 把 `activeNoChangeCount` 重置为 0
And 把 `nextPollAt` 设置为处理时间后 1 分钟

### 场景 20：GitHub response intake — active issue 连续无变化后降级
Given `.state/github-response-intake.json` 中 `tranfu-labs/agent-moebius#4.mode = active`
And 该 issue 已连续 4 次 active poll 无 `updatedAt` 变化
When 下一次 active poll 仍未观察到 `updatedAt` 变化
Then 系统把该 issue 降级为 `mode = idle`
And 不调用 trigger
And 不调用 Codex
And 不发表评论

### 场景 21：GitHub response intake — active issue 的 no-trigger 变化保持 active
Given `.state/github-response-intake.json` 中 `tranfu-labs/agent-moebius#4.mode = active`
And active poll 观察到该 issue 的 `updatedAt` 从 T1 变成 T2
And 最新共享时间线没有有效 trigger
When 系统完成 no-trigger 判定
Then 系统记录该 issue 的 `updatedAt = T2`
And 保持 `mode = active`
And 把 `activeNoChangeCount` 重置为 0
And 把 `nextPollAt` 设置为处理时间后 1 分钟

### 场景 22：GitHub response intake — active poll 见 CLOSED 时从 state 移除
Given `.state/github-response-intake.json` 中 `tranfu-labs/agent-moebius#4.mode = active`
And 用户在 GitHub 上关闭了 issue #4
When 一次 active poll 拉取该 issue
Then `gh issue view` 返回 `state = "CLOSED"`
And 系统记录 `event = "skip"`、`reason = "issue-closed"`、`issueKey = "tranfu-labs/agent-moebius#4"`
And 不调用 trigger
And 不调用 Codex
And 不发表评论
And `.state/github-response-intake.json` 中该 issue 记录被移除
And 下一 tick `getDueActiveIssueSources` 不再返回该 issue

### 场景 22.1：GitHub response intake — failed 后推进 backoff 并到上限降级
Given `.state/github-response-intake.json` 中 `tranfu-labs/agent-moebius#4.updatedAt = T1`
And repository scan 或 active poll 观察到该 issue 的 `updatedAt = T2`
When pre script 执行失败、Codex 执行失败或 GitHub comment 发布失败
Then 系统把该 issue 的已处理 `updatedAt` 更新为 T2
And 保持或设置 `mode = active`
And 把 `activeNoChangeCount` 累加 1
And 把 `nextPollAt` 设为处理时间后 1 分钟
And 当 `activeNoChangeCount` 达到 5 时把 `mode` 降为 `idle`
And 把 `nextPollAt` 设为 `null`
And 不更新 `.state/role-threads.json`
And 不发表评论

### 场景 23：trigger 自反 — dev 写出 plan-written 后同轮触发 reflector stage hook
Given 最新消息包含 `@dev`
And `agents/dev.md` 与 `agents/reflector.md` 都存在
And dev codex 本轮返回的 `${LAST_RESPONSE}` 含 `<!-- agent-moebius:stage=plan-written -->`
When 一次轮询取回该 issue
Then 系统先按 mention trigger 发布 dev 评论
And 在本轮内把刚发布的 dev 评论拼回本地 timeline 再调用 `resolveTrigger`
And 命中 reflector stage trigger 并立即发布 reflector hook 评论
And 不等下一轮 active poll
And 日志包含 `event:self-reflect-hook-commented` 与 `iteration:1`

### 场景 24：trigger 自反 — 命中 mention 时停止自反
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 不含 stage marker 但包含 `@product-manager`
And `agents/product-manager.md` 存在
When 一次轮询取回该 issue
Then 系统按 mention trigger 发布 dev 评论
And 自反时再次解析命中 product-manager mention（`kind === "run-agent"`）
And 系统停止本轮自反，不在本轮调用 product-manager 的 codex
And 日志包含 `event:self-reflect-stopped` 与 `reason:"mention-not-self-reflected"`
And 下一轮 active poll 仍按 mention trigger 处理 product-manager

### 场景 25：trigger 自反 — 达到 MAX_SELF_REFLECT 上限退出
Given 自反循环中连续 3 次 `resolveTrigger` 都返回新的 stage hook 结果（理论极端场景）
When 第 `MAX_SELF_REFLECT + 1` 次循环开始
Then 系统停止本轮自反
And 日志包含 `event:self-reflect-stopped` 与 `reason:"max-iterations"`
And 未发布的 hook 评论留给下一轮 active poll 兜底

### 场景 26：trigger 自反 — 跨 tick 同 (source, stage) 达上限后停止
Given 同一 issue 的 timeline 中已存在 `MAX_SELF_REFLECT` 条 `stage-hook source=dev stage=plan-written` metadata（无论 `sourceIndex` 是否相同）
And 第 `MAX_SELF_REFLECT` 条同 `(source=dev, stage=plan-written)` hook 评论已经包含最后一次自动反思收敛指令
And dev 在最新一轮再次发出包含 `<!-- agent-moebius:stage=plan-written -->` 的评论
When 一次轮询取回该 issue
Then `resolveReflectorStageTrigger` 返回 null
And 系统不再发布 reflector hook 评论
And 跨 tick 循环触发的发散被闭环

### 场景 27：Codex 执行反馈 — 真正调用 Codex 前添加 eyes reaction
Given 最新消息包含 `@dev`
And `agents/dev.md` 存在
And dev preScript 成功
And prompt plan 需要执行 Codex
When runner 即将调用 `runCodex`
Then 系统先为当前 GitHub issue 添加 `eyes` reaction
And 日志包含 `event = "codex-execution-reaction-added"`、`issueKey` 与 `agent = "dev"`
And 随后调用 Codex driver

### 场景 28：Codex 执行反馈 — 非 Codex 执行路径不添加 reaction
Given 最新消息没有有效 mention，或最新消息触发 deterministic stage hook，或选中 agent 的 preScript 失败，或 resume prompt plan 因无新增外部消息跳过
When runner 处理该 issue
Then 系统不添加 `eyes` reaction
And 不把该 reaction 当作处理成功条件

### 场景 29：Codex 执行反馈 — resume fallback 不重复 reaction
Given runner 已在本轮 resume Codex 前添加过 `eyes` reaction
And `codex exec resume <threadId>` 失败
When runner fallback 到 full prompt 再调用 Codex
Then 系统不再添加第二次 `eyes` reaction

### 场景 30：Codex 执行反馈 — reaction 失败不阻断 Codex
Given runner 即将调用 Codex
And GitHub issue reaction API 调用失败
When runner 处理该失败
Then 系统记录 `event = "codex-execution-reaction-failed"` 与错误原因
And 继续调用 Codex driver
And role thread 状态仍只在 Codex 成功且最终 GitHub 评论成功后更新

## 可验证行为
- `pnpm test` MUST 通过，覆盖 local config TOML 解析与 shape 校验、缺失 `config.local.toml` 时默认空白名单、GitHub response intake 的 due 判断、首次 baseline、active/idle 状态转换、active 连续无变化降级、active poll 白名单过滤、active 上限、failed backoff 推进 `updatedAt` / `activeNoChangeCount` / `nextPollAt` 并到上限降级、closed issue 从 active state 移除、对话计数、最新消息选择、agent mention 解析、agent 选择、trigger 解析、reflector stage 触发、普通 `@reflector` 不触发 Codex、stage hook 去重、最后一次自动反思 hook 收敛模板、speaker timeline、full/resume prompt、delta 消息选择、评论格式化、状态读写、agent manifest 解析、agent context 状态读写、dev workspace pre script stale worktree 自动重建与失败 fallback、codex jsonl 最终消息解析、thread id 解析与 cached token 解析、`appendPostedComment` 拼接、`decideNextSelfReflectStep` 4 个分支（post-comment 未到上限、达上限、run-agent、skip）、拼接 dev 评论后 `resolveTrigger` 命中 reflector stage trigger、`buildAddIssueReactionArgs` 构造安全 GitHub reaction 参数、runner 在真实 Codex driver 路径添加 `eyes` reaction 且在非 Codex 执行路径不添加 reaction、以及 reaction 添加失败时仍继续调用 Codex。
- `pnpm typecheck` MUST 通过，确保 TypeScript 严格模式下无类型错误。
- 启动真实 runner 前，运行环境 MUST 满足本机 `codex` CLI 在 `PATH` 中且已完成 `gh auth login`。
- `pnpm start` 会真实扫描白名单 repositories；首次 repository scan 默认只建立 baseline，后续最新消息包含有效 trigger 时会调用 codex 或发布 hook 评论；执行前应确认这是期望的外部副作用。
