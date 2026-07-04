# github-issue-runner 规格

## 域定位
`github-issue-runner` 负责把 GitHub Issue 对话流转成受控的本地脚本执行：常驻进程按本地配置扫描白名单 GitHub repository 的 open issue 更新，通过独立触发器识别最新消息中的 agent mention，并以受控输入把 issue 数据交给本地 `codex`；Codex agent 评论发布前统一交给 CEO guardrail 做无状态校正或追加承接。

当前运行形态是多 repository 轮询的对话型 issue runner：提交版 `config.toml` 只作为示例，代码默认白名单为空；本机可通过被忽略的 `config.local.toml` 配置 watched repositories。每个被处理的 issue 都把 issue body 与 comments 视作一条共享时间线。

## 业务规则
- MUST 作为常驻进程运行，并在启动时立即跑一轮心跳，然后按配置的心跳间隔轮询；默认心跳间隔为 1 分钟。心跳只负责仓库扫描、due 判定与 issue job 派发，MUST NOT 等待任何 issue processing job 完成。
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
- MUST 让 intake 游标 `updatedAt` 只在 GitHub 上留下可见结果之后推进：要么本轮处理成功发布了 agent 评论（`triggered-success`）或确认无需触发（`no-trigger`），要么重试预算耗尽后成功发布了死信评论（`dead-lettered`）。任何处理失败 MUST NOT 推进 `updatedAt`。
- MUST 在拉取 issue body/comments 时同时读取 GitHub `state` 字段（`OPEN` / `CLOSED`），并作为 `GitHubIssue` shape 的必填字段。
- MUST 默认在 repository 首次 baseline scan 时只记录历史 open issue 的 `updatedAt`，不批量处理历史 issue，避免对旧 mention 批量回复。
- SHOULD 支持显式配置 seed issue sources，用于需要启动后立即检查的特定 issue。
- MUST 在 issue 出现 runner-relevant 变化并成功处理后把该 issue 提升为 active mode；若处理返回 `failed`，MUST 保持该 issue 在 active 窗口按 poll 节奏重试，直到后续成功处理，或失败达 `FAILURE_RETRY_LIMIT` 后死信发布成功（`dead-lettered`）降级。
- MUST 默认每 1 分钟轮询 active issues。
- MUST 仅轮询当前 watched repositories 内的 active issues。
- MUST 在 active issue 连续 5 次 active poll 未观察到 GitHub `updatedAt` 变化后，将该 issue 降级回 idle。
- MUST 在 active issue 观察到新 `updatedAt` 且成功处理后重置无变化计数。
- MUST 在 active issue 观察到 `no-trigger` 变化时保持 active，重置无变化计数，并安排下一次 active poll。
- MUST 在 active poll 或 idle-scan changed-issue 处理路径中发现 issue `state = CLOSED` 时，把该 issue 从 `.state/github-response-intake.json` 移除（与 `issue-not-found` 语义一致），不调用 trigger、不调用 Codex、不发评论；MUST 记录 `event = "skip"`、`reason = "issue-closed"` 与 `issueKey`。
- MUST 限制当前 watched repositories 内的 active issues 数量；超出上限时，runner MUST 将多余 issue 降级到 idle 并记录原因。
- MUST 把 GitHub response intake 状态保存在本地忽略目录 `.state/github-response-intake.json`，状态至少包含 repository idle scan 时间、issue `updatedAt`、mode、active 无变化计数、下次轮询时间，以及可选 `failureCount`（缺省 0）与 `lastFailureReason`。
- MUST 在 `no-trigger` 后推进 intake `updatedAt`；`failed` 后 MUST 更新 `failureCount` / `lastFailureReason` / `nextPollAt` 但 MUST NOT 推进 `updatedAt`，重试节奏由既有 poll / scan 间隔约束，MUST NOT 每 tick 刷屏。
- MUST 在单 issue 处理返回 `failed` 时保留既有 `updatedAt`、`failureCount` 累加 1（此前 idle 或缺失状态从 1 开始）、记录 `lastFailureReason`、`activeNoChangeCount` 保持不变、`mode = active`、`nextPollAt` 设为处理时间后 `activeIssuePollIntervalMs`。失败 MUST NOT 消耗安静降级预算（`activeNoChangeCount`），安静轮询 MUST NOT 消耗失败预算（`failureCount`）。
- MUST 在 `triggered-success` / `no-trigger` / `dead-lettered` 结局折叠时清零 `failureCount` 与 `lastFailureReason`。存量状态文件（无新字段）MUST 可直接加载。
- MUST 在处理失败且折叠后 `failureCount` 将达到 `FAILURE_RETRY_LIMIT` 时，于同轮先完成本次真实处理尝试、确认仍失败后，向该 issue 发布死信评论；死信评论发布成功 MUST 折叠为 `dead-lettered`（推进 `updatedAt`、`mode = idle`、清零计数、`nextPollAt = null`），发布失败 MUST 保持 `failed` 并在后续轮次继续「先处理、后死信」。MUST NOT 在本轮处理成功时发布死信。
- MUST 让死信评论以系统身份发布、不包含任何 agent mention、携带机器可识别标记 `<!-- agent-moebius:dead-letter -->`，并包含目标 agent 名、`lastFailureReason`、累计失败次数与恢复提示（在 issue 发表任意新评论即可重新触发）。
- MUST 在死信评论被后续扫描读到时按 `no-trigger` 吸收，MUST NOT 形成自触发循环。
- MUST NOT 在 pre script 执行、Codex 执行或 GitHub comment 发布失败时推进 role-thread 状态；失败时仅更新 intake `failureCount` / `lastFailureReason` / `nextPollAt`，MUST NOT 推进 `updatedAt`，由重试预算与死信机制收敛。
- MUST keep an interrupted issue active and schedule a follow-up poll without advancing processing to the newly arrived message's `updatedAt`.
- MUST 通过独立 driver pool 抽象执行可能调用本地 Codex driver 的 issue processing jobs；driver pool MUST NOT 依赖 GitHub issue domain types、trigger 规则、prompt 或 intake state。
- MUST 在调度业务逻辑注入 Codex driver pool 时使用默认并发上限 `CODEX_DRIVER_POOL_MAX_CONCURRENT = 5`；`src/driver-pool.ts` 抽象本身仍允许 `undefined` 或 `null` 表示无限制，以便测试注入 fake pool。
- MUST 通过编排层导出函数 `createDefaultCodexDriverPool()` 装配默认 driver pool；`DEFAULT_TICK_DEPENDENCIES.driverPool` 由该函数初始化，便于测试直接对默认 pool 断言并发行为。
- MUST 允许 driver pool 使用正整数 `maxConcurrent` 显式限流；配置后同一时刻 running jobs 数量 MUST 不超过该值，queued jobs MUST 在 running job 完成后继续启动。
- MUST 允许 runner 测试注入 fake 或 instrumented driver pool，使 runner 编排可在不调用本地 Codex driver 的情况下测试。
- MUST 把 `CODEX_DRIVER_POOL_MAX_CONCURRENT` 与 `FAILURE_RETRY_LIMIT` 写入启动日志 `CONFIG_LOG_FIELDS`（字段名分别为 `codexDriverPoolMaxConcurrent` 与 `failureRetryLimit`）。
- MUST 保持心跳级防重入：上一轮心跳的扫描派发阶段尚未返回时，同一 runner 进程 MUST NOT 启动新心跳（记录 `event = "skip-overlap"`）；正在执行的 issue processing jobs MUST NOT 阻止后续心跳的扫描与派发。
- MUST 在同一轮心跳内按 `issueKey` 去重 issue processing jobs；并 MUST 维护跨心跳的 in-flight issue 集合：已有 job 在执行的 issue 在后续心跳 MUST NOT 重复派发，MUST 记录 `event = "skip-inflight"` 与 `issueKey`；job settle（成功、失败或异常）后 MUST 从集合移除该 issue。
- MUST 在每个 driver job 完成时立即把其 result 以纯函数折叠进单写者持有的内存 intake state 并调度落盘；并发完成的 jobs 的折叠 MUST 互不覆盖，MUST NOT 等待同批其他 job 完成后统一落盘。
- MUST 把 intake state 的内存持有与文件落盘分离：所有状态变更通过单写者以纯函数变换同步应用；文件写入 MUST 串行化且可合并（写进行中的新变更合并为最新快照的一次后续写），并保持原子写；写失败 MUST 记录日志且 MUST NOT 中断运行，后续变更 MUST 重试落盘。
- MUST 在 issue job 运行期间不推进该 issue 的 intake state；由 job 完成后的折叠一次性推进，后续心跳依据折叠后的状态重新推导 due 工作（对在跑 issue 的中途变化不排队、不重放，等价于容量为 1、最新快照胜出的信箱）。
- MUST 让 active issue 数量上限策略不降级 in-flight issue；由此产生的瞬时超额由后续折叠收敛。
- MUST 在仓库扫描中先完成异步列表拉取、再以纯变换把扫描结果应用到当前内存状态，MUST NOT 用异步期间的旧状态快照整体覆盖执行侧已折叠的结果。
- 崩溃语义：in-flight job 未折叠的结果随进程丢失后，重启 MUST 依靠 `updatedAt` 比对重新发现待处理工作，MUST NOT 依赖额外持久化的执行中标记。
- MUST 为同一 runner 进程内每个本地 Codex driver run 生成唯一 run directory；即使并发 runs 拥有相同 message count 且在同一 timestamp interval 内启动，runDir 也 MUST 不相等。
- MUST 在配置的目标 issue 暂不可解析时把本轮视为可恢复 skip，记录 `reason = "issue-not-found"` 与 `issueKey`，并等待后续轮询。
- MUST 在目标 issue 不存在或已关闭时不调用 Codex、不发表评论，并从 intake active 状态中移除或降级该 issue。
- MUST 把非 issue-not-found 的处理失败（含 GitHub CLI 失败、pre script 失败、Codex 失败、看门狗超时、thread 状态解析失败）统一折叠为携带失败原因的 `failed`，MUST NOT 在结局层按错误类型分类决定游标是否推进。`classifyGhError` 仅继续用于 gh 调用内同步重试的重试判定。
- MUST 对 `gh` CLI 调用提供调用内同步重试（指数退避），只重试 `classifyGhError` 判定为 `transient` 的错误；判定为 `deterministic` 的错误（issue 不存在、`HTTP 40x/422`、`Bad credentials`、`gh auth login`、`ENOENT` 等）MUST 立即上抛不重试。重试参数集中在 `src/config.ts` 的 `GITHUB_CLI_RETRY_POLICY`，每次重试 MUST 记录 `event = "gh-retry-attempt"`（含 `label`、`attempt`、错误原因）。
- MUST 为每次 `gh` CLI 子进程调用设置显式单次调用超时；超时后 MUST 终止对应子进程并让调用 promise settle，MUST NOT 让任何单个 `gh` 子进程永久挂起 runner 心跳或 issue job。
- MUST 在调用方 `AbortSignal` 触发时终止正在执行的 `gh` CLI 子进程，并停止后续 retry / sleep。
- MUST 让 `gh` CLI timeout 类错误按 transient GitHub CLI 失败处理：只读拉取与幂等 reaction MAY 在 `GITHUB_CLI_RETRY_POLICY` 预算内重试；发布 GitHub 评论与 release upload 等可见写操作 MUST NOT 自动重试。
- MUST 让重试原语 `withRetry` 支持 `AbortSignal` 取消：signal 触发时停止后续重试与退避等待并上抛；MUST 允许注入无副作用 sleep，使重试逻辑可在不真实等待的情况下单元测试。
- MUST 让 `classifyGhError` 以 `gh` 命令 stderr / 错误消息为依据返回 `"transient" | "deterministic"`；未知的 `gh` 运行期失败默认 `transient`。
- MUST 对发表评论（写操作）默认不自动重试，避免瞬时错误引发重复评论；对幂等的 issue reaction 与只读拉取（issue 列表 / issue 详情）允许重试。
- MUST 以「首条 GitHub 评论发布成功」为发布边界：边界之前的任何失败 MUST 折叠为 `failed`（不推进 `updatedAt`，重入安全）；边界之后的失败 MUST NOT 触发重入（避免重复发帖），按已发布收尾并记录日志。role-thread 状态 MUST 在首条评论发布成功之后才保存，保证重入时增量窗口一致。
- MUST 记录结构化日志：失败重试 `event = "issue-retry-scheduled"`（含 `issueKey`、`failureCount`、失败原因），死信发布成功 `event = "dead-letter-posted"`，死信发布失败 `event = "dead-letter-post-failed"`。
- MUST 在收尾中断检查（codex 成功后的 conversation snapshot 复核）因 GitHub CLI 抛异常而失败时 fail-open：记录 `event = "agent-run-interrupt-check-failopen"`，视作未观察到新消息并照常执行后续发布流程，MUST NOT 因该次检查失败而丢弃已完成的 codex 产出或返回 `failed`。
- MUST 为单次本地 codex run 设置总时长看门狗上限 `CODEX_RUN_MAX_DURATION_MS`；超时 MUST 通过既有 `AbortController` 中止该 run；即使 driver promise 永不 settle，runner 也 MUST 先合成 timeout failure 让 issue job settle，记录 `event = "codex-watchdog-timeout"` 并将该次处理判为 `failed`（区别于收到新消息的 `interrupted`），以兜底 in-flight job 永不返回导致的 `skip-inflight` 死锁。
- MUST 让 `src/codex.ts` adapter 在收到 abort 时终止底层 `codex` 子进程并返回 interrupted failure result，必要时从温和中断升级到强杀，避免 driver pool 依赖永不返回的真实子进程自行释放名额。
- MUST 把 `GITHUB_CLI_RETRY_POLICY` 与 `CODEX_RUN_MAX_DURATION_MS` 写入启动日志 `CONFIG_LOG_FIELDS`。
- MUST 按 `count = 1 + comments.length` 计算消息总数，用于日志与本地脚本执行目录命名；它不作为 role thread resume 的唯一上下文依据。
- MUST 支持通过 `agents/*.md` 文件名寻址 agent；`agents/<agent-name>.md` 对应 issue 消息里的普通 `@<agent-name>` mention 触发方式。
- MUST 将 agent 触发决策封装为独立触发器；runner 只消费触发器结果，不把具体触发方式写死在编排流程中。
- MUST 提供 `docs/protocols/github-interaction.md` 作为 GitHub issue 共享时间线交互协议的单一事实源，适用于所有 agent 输出、CEO append、人类评论与 loop watcher 补发评论。
- MUST 让全局 GitHub 交互协议至少覆盖六条规则：`@` 语义等于移交下一步控制权且每条消息最多一个合法 agent mention；裸 `#N` 只用于真实引用 GitHub issue / PR，任务编号、评论编号、验收语句编号与步骤编号不得写成裸 `#N`；runner 专属 role envelope（`<role>:` 可见前缀与 `<!-- agent-moebius:role=... -->` metadata）不得由人工或 loop watcher 手写伪装；带路由意图的人工评论必须显式包含一个合法 agent mention；验收截图必须按「验收证据」契约用 worktree 相对路径显式引用；验收语句变更、验收范围调整和验收结论 override 必须由需求持有者或真人用户确认，并清晰落在 issue 时间线。
- MUST 让全局 GitHub 交互协议为每条规则提供正例、反例与合规改写；任务编号示例 MUST 使用 `T3` 等非 GitHub issue 引用形式，评论位置 MUST 使用「第 N 条评论」或完整评论 URL，验收编号 MUST 使用「验收语句 N」文字形式，避免制造真实 issue / PR 反向引用。
- MUST 让所有 `agents/*.md` persona 引用并遵守 `docs/protocols/github-interaction.md`；persona 文件只做最小引用，MUST NOT 复制协议全文形成多事实源。
- MUST 让全局 GitHub 交互协议覆盖验收治理规则：验收语句是需求侧资产，包含原始需求验收语句以及经需求持有者或真人用户确认并入的 QA 增补验收语句。
- MUST 要求验收语句变更、验收范围缩小、验收范围扩大后自判通过、或覆盖验收角色不通过结论，只有在需求持有者或真人用户明确确认后才生效。
- MUST 要求确认记录出现在 GitHub issue 时间线，且能让后来者直接看出谁确认、确认什么变更、适用于哪组验收语句或哪次验收结论。
- MUST NOT 把沉默、继续执行、执行方自述、执行方转述或 loop watcher 代述视为验收语句变更或验收结论 override 的有效确认。
- MUST 保留 mention trigger：最新消息的非代码文本区域包含已存在 agent mention 时，触发对应 agent；fenced code block 与 inline backtick 内的 mention 不参与触发。
- MUST NOT 提供 `agents/reflector.md` 或任何 reflector stage trigger；`@reflector` 在当前系统中只是未知 mention，不触发任何执行或评论。
- MUST 集中定义 stage 枚举于 `src/stages.ts`，供 CEO guardrail 与各 agent persona 契约测试共用；多处 MUST NOT 各自维护副本。
- MUST 让 `AllStages = ["plan-written", "code-verified", "in-progress"]`。
- MUST 让 CEO guardrail 承担阶段验收回流入口：当 Codex agent 的 `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified` 时，`agents/ceo.md` MUST 先查可用「验收语句」清单。`plan-written` 有可用清单时，CEO MUST `append as=ceo` mention `@qa` 要求按其测试设计流程审查本轮方案，MUST NOT 直接 mention 发起需求角色；不查历史 qa 结论——dev 每次重出 `plan-written` 都重审（幂等，防止拿旧结论放行新方案），qa 审查通过后由 qa 自行 mention 发起需求角色交棒。`code-verified` 有可用清单且发起本需求者是可达 agent 时，CEO MUST 返回 `append`，默认 `as=ceo`，正文 mention 发起需求角色并要求其按验收语句逐条验收实现证据。缺少可用验收语句时，CEO MUST `append as=ceo` mention `@dev` 要求补齐；`code-verified` 分支下若发起者是真人用户而非 agent，CEO MUST 输出 `no_change`，维持等真人用户验收。
- MUST 让 `agents/ceo.md` 承载「qa 交棒兜底」识别场景：`agent = qa` 的 `latestResponse` 含固定结论行时，检查交棒 mention 是否完整——结论行为 `QA 结论：通过` 但正文未 mention 发起需求角色时，CEO MUST `append as=ceo` mention 发起需求角色（识别优先级沿用既有规则）要求按含 QA 增补的「验收语句」逐条验收；结论行为 `QA 结论：不通过` 但正文未 mention `@dev` 时，CEO MUST `append as=ceo` mention `@dev` 要求按 qa 列出的缺陷修正方案后重新输出 `plan-written`；交棒 mention 正常时 MUST 输出 `no_change`，不重复催办。
- MUST 让 `agents/ceo.md` 承载验收治理违规识别场景：发现执行方或 loop watcher 未经确认改写验收语句、缩小验收范围、扩大验收范围后自判通过、未经确认把 QA 增补当作已生效清单、声称已确认但时间线没有可追溯确认记录、或覆盖验收角色不通过结论时，CEO MUST 输出 `append`、`as=ceo`，指出变更未经确认，并要求需求持有者或真人用户表态。
- MUST 让 CEO 在验收治理违规场景中只要求补确认或请需求持有者表态，MUST NOT 直接替需求持有者改写新验收语句，MUST NOT 直接宣布未经确认的 override 生效。需求持有者或真人用户已在时间线明确确认且记录可追溯时，CEO MUST NOT 仅因该变更本身介入。
- MUST 让 `agents/ceo.md` 在 `plan-written` 阶段判断本轮 `latestResponse` 是否包含「验收语句」小节且小节内有逐条、可机械执行的检查；在 `code-verified` 阶段优先使用历史有效 `plan-written` 方案中的「验收语句」进行验收回流，若完整公开 issue context 中找不到可用验收语句，则要求 `@dev` 补齐。
- MUST 让 `agents/ceo.md` 按以下优先级识别发起本需求的 agent 角色：issue body 或后续明确流程说明中写明的需求持有者 / 发起者 / 发起需求角色；否则为时间线中最早提出本需求的合法 agent speaker；若发起者是真人用户而非 agent，CEO MUST 输出 `no_change`。
- MUST NOT 让 `agents/ceo.md` 把转交或维护 CEO 规则的 `secretary` 评论、或 `dev` 的澄清 / 方案 / 实现评论误判为需求发起者；上下文明确写明发起者是 `product-manager` 或 `hermes-user` 时，MUST 以显式信息为准。
- MUST 让 `in-progress` 不触发阶段验收回流强制 append；它仍可按普通 CEO guardrail 场景判断是否需要 append。
- MUST NOT 在 Codex agent post 后进入 self-reflect loop；若 CEO append 评论中包含有效 Codex agent mention，后续 MUST 由下一轮 active poll 按普通 mention trigger 处理。
- MUST 保留每分钟 active poll 与 5 次无变化降级 idle 的现有节奏；CEO append 或外部 actor 写入 mention 时，下一轮 active poll 负责兜底处理。
- 启动日志 MUST NOT 包含 `maxSelfReflect` 字段。
- MUST 支持 agent Markdown frontmatter 声明受信任 `preScript`，用于 runner 在 Codex 执行前准备上下文；Markdown 正文仍作为 persona 文本输入 Codex。
- MUST 将 `preScript` 路径限制在仓库内 `src/agent-prescripts/` 的静态 registry 中；issue body/comment 内容不得成为可执行脚本路径。
- MUST 提供 `src/agent-prescripts/current-repo-workspace.ts` 并将其加入 agent preScript 静态 registry；该 preScript MUST 只返回 agent-moebius 当前仓库根目录作为 `codexCwd`，MUST NOT 创建 worktree、MUST NOT 读写 `.state/*`、MUST NOT 执行来自 issue body/comment 的内容。
- MUST 把共享时间线中的每条消息归一化为 `index`、`speaker`、`body`、`source`。
- MUST 把 issue body 归类为 `user` speaker。
- MUST 优先使用隐藏 metadata `<!-- agent-moebius:role=<role> -->` 识别 runner 生成的 agent comment；没有 metadata 但以 `<known-role>:`、`&lt;known-role&gt;:` 或 raw `<known-role>:` 开头的历史 comment SHOULD 按 legacy agent comment 兼容；其他 comment MUST 归类为 `user`。
- MUST 每轮只检查最新一条归一化消息作为触发源，并由触发器决定是运行 agent 还是跳过。
- MUST 仅当触发源的非代码文本区域包含至少一个已存在 agent mention 时启动本地 `codex`。
- MUST 在触发源没有有效 trigger 时跳过，不调用 `codex`，不发表评论。
- MUST 在同一条消息包含多个非代码文本区域的有效 agent mention 时选择文本中最早出现的一个；协议层仍要求每条消息最多一个 `@`，多 mention 由 CEO 纠偏而非运行时拒绝。
- MUST 在选中 agent 且本轮需要调用 Codex 时先执行该 agent 声明的 pre script；pre script 失败时 MUST 跳过 Codex、跳过 GitHub 评论、保持 role thread 状态不变。
- MUST 在 mention trigger 选中可运行 agent、prompt plan 需要执行、且该 agent 的 preScript 已成功完成后，在首次调用 Codex driver 前，为本轮触发 Codex 的最新消息添加 `eyes` reaction。
- MUST 当触发源是 issue body 时，为当前 GitHub issue 添加 `eyes` reaction。
- MUST 当触发源是 issue comment 时，为该 GitHub issue comment 添加 `eyes` reaction，而不是 fallback 到 issue body。
- MUST 通过 GitHub adapter 使用受控 target 与 argv 参数数组添加 reaction：issue body reaction MAY 使用 REST issue reactions endpoint；issue comment reaction MUST 使用 GitHub comment node id 调用 GraphQL `addReaction`。
- MUST 在拉取 issue body/comments 时保留每条 comment 的 GitHub node `id`，用于 comment reaction target。
- MUST 仅在真实 Codex driver 执行路径添加该 reaction；no-trigger、preScript 失败、prompt plan skip、Codex 不会启动的路径 MUST NOT 添加该 reaction。
- MUST 在同一个 issue 处理周期中最多添加一次 Codex execution reaction；resume 失败后 fallback full run MUST NOT 再添加第二次 reaction。
- MUST 在 Codex execution reaction 添加成功时记录结构化日志，至少包含 `event = "codex-execution-reaction-added"`、`issueKey`、`agent`、`targetSource` 与 `targetIndex`。
- MUST 在 Codex execution reaction 添加失败时记录结构化日志，至少包含 `event = "codex-execution-reaction-failed"`、`issueKey`、`agent`、`targetSource`、`targetIndex` 与错误原因，并继续执行 Codex；reaction 失败本身 MUST NOT 推进或阻断 role thread 状态。
- MUST 在运行被 mention 的 Codex agent 前，从本轮 prompt 范围内的 GitHub issue body/comments 检测图片与视频引用。
- MUST 让媒体引用提取保持为纯业务数据操作，不调用 GitHub、Codex、网络或文件系统。
- MUST 只把 `http:` 与 `https:` URL 视为可下载 issue media 引用。
- MUST 让 issue 输入媒体提取跳过 SVG URL；`.svg` 引用无论来自 Markdown image、Markdown link、HTML `src` 还是 bare URL，均 MUST NOT 进入传给 media-assets / Codex `--image` 的 issue media references。
- MUST 将 issue media 下载到当前 Codex run directory，MUST NOT 写入 `agents/`、`.state/` 或目标 worktree。
- MUST 按媒体类型、响应 content type 与有界大小校验已下载 issue media，再暴露给 Codex。
- MUST 通过重复 `--image <file>` 参数把准备好的图片传给 `codex exec` 与 `codex exec resume`。
- MUST 通过 prompt media manifest 暴露准备好的视频本地文件路径，因为当前 Codex CLI 图片参数不接收视频。
- MUST 在首次 full run 与 fallback full run 中包含完整公开 timeline 的媒体；resume run 只包含新增外部 delta 消息中的媒体。
- MUST 在 issue media 下载或校验失败时发布可见错误评论，MUST NOT 在媒体缺失时静默运行 Codex。
- MUST 在 Codex 启动前的 issue media preparation 失败时保持 role thread 状态不变。
- MUST 将确定性的 media-preparation 错误评论视为已处理本次触发 mention，避免同一个坏链接在 active poll 中重复刷错误评论。
- MUST 支持 `dev` pre script 基于 runner 当前处理的 GitHub issue source（owner、repo、issueNumber）准备 Codex 工作目录，而不是解析 issue body/comment 中的链接。
- MUST 为每个 source issue 创建并复用一个 `dev` issue 独占 worktree；不同 source issue 即使属于同一个 repo 也 MUST 使用不同 worktree。
- MUST 允许同一 repository 的多个 issue worktree 复用本地 bare repo cache，但 MUST 保持 worktree 彼此隔离。
- MUST 在新建或复用 `dev` issue worktree 前刷新目标仓库远端 `main` tracking ref。
- MUST 从已刷新的远端 `main` tracking ref 创建新的 `dev` issue worktree；MUST NOT 依赖本地 bare repo 的 `HEAD` 作为新 worktree 基线。
- MUST 在复用已有 `dev` context 时验证记录的 `worktreePath` 与当前 owner / repo / issue / role / workdir root 计算出的 issue 独占 worktree 路径完全一致；不一致时 MUST fail closed，且不得访问、删除或重建该路径。
- MUST 在复用已有 `dev` issue worktree 前检查当前 worktree `HEAD` 是否包含最新远端 `main`。
- MUST 在已有 `dev` issue worktree 落后最新远端 `main` 时先强制删除该 worktree（`git worktree remove --force`；失败时 fallback 到 `rm -rf` + `git worktree prune`），再从 `refs/remotes/origin/main` 重建；重建成功后继续以同一路径作为 Codex cwd，并保持原 agent context state。
- MUST 在 stale worktree 重建过程任一步失败时 fail closed，不调用 Codex、不发表评论、不推进 role thread 状态，并返回 `stale-worktree-rebuild-failed:<detail>`。
- MUST 在 stale worktree 自动重建过程中丢弃 worktree 内未推送的本地 commit；agent 产出的落地口径是 commit + push，未 push 的改动不属于要保护的运行时状态。
- MUST 在已有 `dev` context 指向缺失或不可访问 worktree 时 fail closed，不自动重建。
- MUST 让 `dev` pre script 的 git 调用在失败时携带 stderr 摘要（如 `git failed with exit-code-128: fatal: unable to access ...`），使 `lastFailureReason` 与死信评论可定位根因。
- MUST 让 dev-workspace pre script 在为一个 issue 建立 worktree 时把 worktree checkout 到受控本地分支 `agent/<role>/<owner>__<repo>__<issue>`（`role` / `owner` / `repo` 经 `safePathSegment` 规范化，`issue` 为 `issueNumber` 十进制字符串），MUST NOT 让 worktree 停留在 detached HEAD 状态。新首建路径与 stale 重建路径 MUST 使用同一命名规则，MUST 使用 `git worktree add -B <localBranch> <worktreePath> refs/remotes/origin/main` 语义（分支不存在则创建、存在则强制 reset 到 `refs/remotes/origin/main`）。
- MUST 让 dev-workspace pre script 对同一个 bare repository cache（同一 `repoCachePath`）的 `git clone --bare` / `git fetch --prune` / `git worktree add` / `git worktree remove` 操作按 `repoCachePath` 键值串行执行；跨不同 bare repository cache 的操作 MUST 保持并发不受限。串行化 MUST 在 `dev-workspace.ts` 模块内部完成，MUST NOT 依赖 runner 层派发聚合，MUST NOT 影响 `saveStateEntry` 与 `loadState` 等不接触 bare repository 的步骤的并发性。
- MUST support interrupting an in-flight `dev` Codex run when the source conversation receives a new message before Codex completes.
- MUST model agent-run interruption through a driver-agnostic conversation snapshot abstraction, so drivers provide current conversation state instead of embedding GitHub-specific logic in the local script executor.
- MUST use GitHub issue body + comments count as the GitHub conversation snapshot message count for new-comment interruption.
- MUST 允许同一个 issue 中多个 role 参与对话，并为每个 role 维护独立 Codex thread。
- MUST 把 role thread 状态保存在本地忽略目录 `.state/role-threads.json`，状态至少包含 issue 标识、role、threadId、lastSeenIndex。
- MUST 按 issue + role entry 级别串行 merge 写入 `.state/role-threads.json`，锁作用域为目标 state file path，避免不同 issue 或 role 的并发 Codex 成功结果互相覆盖。
- MUST 把 agent pre script 上下文保存在本地忽略目录 `.state/agent-contexts.json`，状态至少包含 issue、role、preScript、目标仓库、worktreePath、preparedFromMessageIndex。
- MUST 按 issue + role entry 级别串行 merge 写入 `.state/agent-contexts.json`，锁作用域为目标 state file path，避免不同 issue 的并发 dev pre script context 互相覆盖。
- MUST 在首次触发某个 role 时使用该 role persona 与当前共享时间线构造 full prompt，并从 Codex JSONL 的 `thread.started.thread_id` 记录该 role 的 thread id。
- MUST NOT 使用 `--ephemeral` 执行首次 Codex run，因为 role thread 需要可 resume 的 Codex session。
- MUST 在再次触发同一 role 时使用 `codex exec resume <thread_id>`，并只把该 role 上次处理后新增、且 speaker 不是该 role 自己的消息合并成 delta prompt。
- MUST 在 3 个及以上 agent 参与同一 issue 时，保持其他 role 与用户的新增消息按共享时间线原顺序进入当前 role 的 delta prompt。
- MUST 在没有新增外部消息时跳过 resume，避免把 role 自己已在 thread 内的回复重复喂回。
- MUST 从 Codex JSONL stdout 中提取最终 assistant 文本；当前已知格式包括顶层 `agent_message` / `assistant_message` / `message`，以及 `item.completed` 中嵌套的 `item.type=agent_message` / `item.text`。
- MUST 从 Codex JSONL stdout 中提取 `thread.started.thread_id` 作为 role thread 句柄。
- SHOULD 记录 Codex JSONL 中的 `turn.completed.usage.cached_input_tokens`，用于观察 Codex resume 与模型侧 prompt caching 的收益。
- MUST 在 pre script 返回 Codex 工作目录时，以显式 `cwd` 调用 Codex。
- MUST 在发布 agent comment 前发现 Codex 本轮生成的受支持 SVG、图片与视频 artifact。
- MUST NOT 为了让输出 artifact 在 GitHub comment 中可见而把生成产物提交到 source repository。
- MUST 通过 artifact publisher 边界发布生成 artifact，并返回 GitHub comment 可直接查看的 Markdown 引用。
- MUST 默认使用同仓库 GitHub release tag `agent-moebius-artifacts` 存储 artifact，且不把生成文件提交到 worktree 或 source branch。
- MUST 在 CEO guardrail 接收 `latestResponse` 前，把已发布 artifact 预览追加到 agent 最终回复。
- MUST 在生成 artifact 发布失败时发布可见错误评论，MUST NOT 声称 artifact 已成功交付。
- MUST 保留 output artifact 发布对 SVG 的支持；SVG 过滤仅适用于 issue 输入媒体引用，不适用于 Codex 生成产物发布。
- MUST 等到 agent comment 与必要 artifact publication 都成功后才更新 role thread 状态。
- MUST 让 artifact publishing 保持在 `conversation.ts`、`github-response-intake.ts`、`driver-pool.ts` 等纯调度模块之外。
- MUST 把 agent final response 中显式引用的 worktree 相对 artifact 路径作为验收截图与生成媒体的主要发现契约。
- MUST 按 Codex cwd 解析显式相对 artifact 路径，并拒绝绝对路径或解析后逃逸 cwd 的路径。
- MUST NOT 主动发布 dev worktree 中未被 final response 显式引用的验收截图；mtime-based discovery 不得覆盖该验收截图契约。
- MUST 在发布前把每个通过校验的 output artifact 复制到当前 run directory 的 `output-artifacts/` 目录。
- MUST 在每轮完成的 Codex run 后 best-effort 追加 JSONL run manifest 到 `.state/run-manifests.jsonl`。
- MUST 让每条 run manifest record 包含 `issue`、`role`、`stage`、`artifacts`、`startedAt` 与 `completedAt` 字段。
- MUST 让 run manifest `stage` 来自原始 agent final response 尾部 stage marker，且 artifact markdown 追加与 CEO guardrail 处理不得影响该值。
- MUST 在原始 final response 缺少合法 stage marker 时，把 manifest `stage` 写为 `unknown`；`unknown` 仅属于 manifest schema，MUST NOT 扩展 `src/stages.ts` 或 agent comment stage marker。
- MUST 在无 output artifact 时记录空 `artifacts` 数组。
- MUST 在 artifact publisher 成功时记录 artifact staged path 与 publisher URL；publisher 失败时记录 staged path 且 `publishedUrl = null`，并继续按既有语义发布 artifact 错误评论、不更新 role thread、不伪装成功。
- MUST 把 run manifest writer failure 视为 best-effort observation failure：记录 `event = "run-manifest-write-failed"`，但不得改变成功 agent comment 发布、role thread 更新或 artifact 错误评论语义。
- MUST 提供本地只读观察页入口 `pnpm observer`。
- MUST 让观察页进程独立于 runner 进程：observer 启动、崩溃、退出或被强杀不得影响 runner heartbeat、issue processing、driver pool、role thread state、intake state、artifact publishing 或 CEO guardrail 行为。
- MUST NOT 让 runner import、调用或依赖 `src/observer/` 模块。
- MUST 让 observer 只读本地 `config.toml`、`config.local.toml`、`.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/run-manifests.jsonl`。
- MUST NOT 让 observer 调用 GitHub、Codex、release upload、artifact publisher 或任何状态 save helper。
- MUST NOT 让 observer 写 `.state/*.json`、`.state/run-manifests.jsonl`、run manifest 副本、release asset、worktree 文件或 runner state。
- MUST 让 observer 只展示本地 watched repository 白名单内的 repository；非白名单 repository 的本地记录 MUST 被忽略。
- MUST 在白名单 repository 没有本地 issue 记录时显示独立空态。
- MUST 在 observer 输入文件存在但不可读、不可解析或 shape 校验失败时显示独立读取失败诊断。
- MUST 让“没有记录”和“读取失败”在文案与视觉状态上可区分。
- MUST 从 GitHub response intake state、role thread state、agent context state 与 run manifest records 聚合 issue 记录，且 MUST NOT 新增业务状态机。
- MUST 标注每个 issue 状态来源，包括 intake mode / failure data、role thread `lastSeenIndex`、agent context worktree data，以及可用时的最新 run manifest stage。
- MUST 逐行解析 `.state/run-manifests.jsonl`，跳过坏行或不完整 record，并保留被跳过行号的诊断。
- MUST 把无换行结尾的截断 JSONL 尾行视为坏 manifest line，跳过该行并保留此前完整 records。
- MUST 诊断 manifest 缺少 `issue` 或 `artifacts` 等必填字段的 record，且不得丢弃其他有效 manifest records。
- MUST 在 `.state` 文件缺失、JSON state 文件损坏、JSONL 行损坏或 manifest record 不完整时继续渲染观察页。
- MUST 把缺失 `.state` 文件分类为 missing diagnostic，而不是读取失败。
- MUST 把损坏的 `config.toml` 或 `config.local.toml` 分类为配置读取失败，而不是空白白名单。
- MUST 从 run manifest records 展示 artifact；`publishedUrl` 存在时显示链接，且 URL 看起来是图片时渲染图片预览。
- MUST 在 `publishedUrl = null` 时把 staged artifact `path` 显示为“未发布”；observer MUST NOT 伪造 URL 或发布 artifact。
- MUST NOT 在 observer UI 提供操作按钮或写动作。
- MUST 在浏览器刷新或新 HTTP 请求时重新读取本地文件；v0 MUST NOT 要求 file watcher。
- MUST 在 observer 启动、页面刷新、artifact 区域查看与 observer 停止后，保持 watched config files、`.state/*.json`、`.state/run-manifests.jsonl`、artifact directories 与 release directories 无新增、无修改。
- MUST 在 `PATH` 前置 fake `gh` 与 fake `codex` 时仍能渲染 observer 页面，且这些 fake command 在 observer request 期间 MUST 没有调用记录。
- MUST 让所有 Codex agent persona（`agents/dev.md`、`agents/dev-manager.md`、`agents/product-manager.md`、`agents/hermes-user.md` 及未来新增 Codex agent）契约要求：每条响应末尾必须以 `<!-- agent-moebius:stage=<enum> -->` marker 结尾，`<enum>` MUST 属于 `AllStages`。
- MUST 让 `agents/dev.md` 要求 dev 在 `plan-written` 响应的方案正文末尾包含「验收语句」一节；该节 MUST 位于最终 stage marker 之前，stage marker 仍 MUST 是整条回复最后一行。
- MUST 让 `agents/dev.md` 要求「验收语句」中的每条语句都是一句可机械执行的检查；UI 类使用 `打开 X → 做 Y → 应看到 Z` 格式，非 UI 类使用等价可执行断言格式，例如 `跑 X → 应输出/退出码 Z`。
- MUST 让 `agents/dev.md` 要求「验收语句」数量与方案的功能点一一对应。
- MUST 让 `agents/dev.md` 要求 dev 在已有验收语句上只做机械可执行化细化并说明理由；dev MUST NOT 自行改变验收目标、删减范围、合并或替换验收语句。确需调整时，dev MUST 请求需求持有者或真人用户在 issue 时间线确认。
- MUST 让 `agents/dev.md` 要求 dev 实现阶段只能基于已确认验收清单执行；QA 增补只有经需求持有者或真人用户明确接受后才并入清单，执行方自述、loop watcher 转述或沉默都不能作为确认依据。
- MUST 让 `agents/hermes-user.md` 在被 mention 请求验收方案或代码结果时，按可用「验收语句」逐条走查并输出结构化结论。
- MUST 让 `agents/product-manager.md` 在被 mention 请求验收方案或代码结果时，按可用「验收语句」逐条走查并输出结构化结论。
- MUST 让 `agents/product-manager.md` 与 `agents/hermes-user.md` 在验收方案或代码结果时只按已确认验收语句、以及已确认并入的 QA 增补验收语句逐条走查。
- MUST 让验收角色发现未经确认的 rescope 或 override 时，明确指出未经确认并要求回到需求持有者或真人用户确认。
- MUST 让验收角色自身作为需求持有者调整验收语句、接受 QA 增补或确认 override 时，把明确确认记录写在 issue 时间线，且确认记录能看出谁确认、确认什么、适用于哪组验收语句或哪次验收结论。
- MUST 让验收角色的每条验收结论对应一条验收语句，并包含 `通过` 或 `不通过` 与依据。
- MUST 让验收角色在方案阶段基于阅读 dev 方案进行推演验收，在代码阶段基于 dev 提供的测试输出、截图 artifact、文件路径、命令输出等证据验收。
- MUST 让验收角色在全部验收语句通过时声明验收通过，并说明下一步等待谁。
- MUST 让验收角色在任一验收语句不通过时 mention `@dev`，并明确指出未过语句、实际观察与期望差异。
- MUST 让 `agents/hermes-user.md` 与 `agents/product-manager.md` 的验收响应仍以 `<!-- agent-moebius:stage=in-progress -->` 作为最后一行。
- MUST 提供 `agents/dev-manager.md` 作为技术负责人 Codex driver agent persona，与 `dev`、`product-manager` 同级、同样以 `agents/*.md` 文件名自动发现加载；核心职责为技术决策、架构选型与质量保证，MUST NOT 亲自写实现代码。
- MUST 让 `agents/dev-manager.md` 以对话形式给出技术决策，MUST NOT 落 ADR / design 文件；当某决策会打破 `docs/architecture/module-map.md` 的依赖方向时，MUST 要求写码方在实现时补一条 ADR（自身不落盘）。
- MUST 让 `agents/dev-manager.md` 承载方案评估方法论——一组不分先后的并行判断维度，至少覆盖：优先搜英文网络最佳实践 / 成熟开源框架 / 项目现有能力再决定是否自造；方案可行性与可靠性（失败模式、边界、降级 / 回滚）；对其它模块的影响与新增 BUG / 回归 / 安全漏洞风险；成本与长期演进。
- MUST 让 `agents/dev-manager.md` 保持通用、自包含：只描述自身职责与方法论，MUST NOT 硬编码指向某个具体协作 agent；协作对象一律按承载 `agents/<name>.md` 的通用对象表述。
- MUST 让 `agents/dev-manager.md` 每条响应末尾以 `<!-- agent-moebius:stage=in-progress -->` 结尾，阶段语义用正文表达，MUST NOT 为其新增注册 stage。
- MUST 提供 `agents/secretary.md` 作为普通 Codex driver agent persona，与 `dev`、`dev-manager`、`product-manager`、`hermes-user` 同级、同样以 `agents/*.md` 文件名自动发现加载；其核心职责为采访并沉淀 CEO guardrail 漏判反馈，维护 `agents/ceo.md` 及相关 specs/tests/docs。
- MUST 让 `agents/secretary.md` 通过 frontmatter 声明受信任 preScript `src/agent-prescripts/current-repo-workspace.ts`，使 secretary Codex cwd 固定为 agent-moebius 当前仓库根目录。
- MUST 让 secretary 在处理 CEO 漏判反馈时先采访；采访至少覆盖触发输入模式、应输出模式、适用 / 不适用边界、是否需要补救当前 issue。信息不足时 MUST 停下问，信息足够时按 OpenSpec 流程维护 CEO 规则。
- MUST 让 `agents/secretary.md` 每条响应末尾以 `<!-- agent-moebius:stage=in-progress -->` 结尾；secretary MUST NOT 使用 dev 专属的 `plan-written` / `code-verified` 阶段语义。
- MUST 让 secretary 遵守活仓库 git 纪律：MUST NOT 创建、切换或 reset 分支，MUST NOT 开 PR；所有改动直接在当前分支完成。开工前 MUST 检查工作树，发现与本次无关的未提交改动时 MUST 停下向用户报告，MUST NOT 擅自 stash / checkout / 提交他人改动。commit 时 MUST 只 add 自己改动的具体路径，MUST NOT `git add -A`。
- MUST 让 secretary 在 commit + push 前通过 issue comment 征得用户同意；未获同意 MUST NOT commit/push。push 被拒时 MUST `git pull --rebase` 后重试一次，再失败 MUST 停下报告。
- MUST 让 secretary 采访后按结论分叉：CEO 行为正确 / 用户误判时解释原因并干净结束，MUST NOT 强造 change；属 runtime 缺陷而非规则缺失时说明诊断并指引转交（如 `@dev`），MUST NOT 用 prompt 规则补 runtime bug；确认规则缺失才进入方案流程。
- MUST 让 secretary 在聊天框方案获用户确认前 MUST NOT 落盘 `openspec/changes/`、MUST NOT 修改 `agents/ceo.md`；该闸门由 persona 自身承载（secretary 恒为 `in-progress`，runner 不强制介入）。
- MUST 让 secretary 的「补救当前 issue」动作以 secretary 自身署名在正文补发提醒并注明代 CEO 补发；MUST NOT 伪装 `ceo` 署名。
- MUST NOT 让 secretary 承接与 CEO guardrail 规则无关的开发 / 事务请求；收到时 MUST 指引用户找对应 agent（如 `@dev`）并结束。
- MUST 让 secretary 在向 `agents/ceo.md` 追加规则前检查与既有规则是否冲突、或叠加导致 CEO 过度介入；每条新规则 MUST 在对应 change 的 spec-delta 中配一个 Given/When/Then 场景。
- MUST 让 `in-progress` 承载“还在干活 / 采访 / 澄清 / 报进度 / 等待用户，不需要 CEO 阶段反思强制介入”的语义。
- SHOULD 让 `plan-written` / `code-verified` 保持为 dev agent 的开发阶段语义；其他 Codex agent 的默认 stage MUST 为 `in-progress`。
- MUST 提供 `agents/qa.md` 作为测试设计 Codex driver agent persona，与 `dev`、`dev-manager`、`product-manager`、`hermes-user`、`secretary` 同级、同样以 `agents/*.md` 文件名自动发现加载；核心职责为方案阶段的对抗性测试设计审查，MUST NOT 写实现代码，MUST NOT 亲自执行故障注入（增补用例由 dev 在实现阶段执行并附证据）。
- MUST 让 `agents/qa.md` 以 `docs/architecture/invariants.md` 与需求原文为判定标准（oracle）审查方案；MUST NOT 把方案自述当作唯一判定标准（防止审查退化为"方案做到了方案说的"式确认）。
- MUST 让 qa 对含运行时行为改动的 `plan-written` 方案执行四步审查：① 提取方案依赖的经验假设清单（外部行为事实性断言）并标注是否已验证；② 过故障矩阵（外部依赖 × {快速失败, 永久挂起, 慢成功, 状态丢失} × 流水线阶段），只列有问题的格；③ 用例二分——方案缺分支的静态可裁决缺陷当场判不通过、依赖经验假设的写成可机械执行的故障注入验收语句增补；④ 对抗性审查已有「验收语句」是否可机械执行、是否只覆盖 happy path。
- MUST 让 qa 审查评论包含固定结论行 `QA 结论：通过` 或 `QA 结论：不通过`；不通过时每条缺陷 MUST 挂靠到具体故障矩阵格或 `invariants.md` 条目，未挂靠的泛化批评视为无效缺陷。
- MUST 让 qa 按结论执行 mention 协议（一轮只一个 mention）：不通过 → mention `@dev` 逐条列缺陷与增补要求；通过 → mention 发起需求角色请其按含 QA 增补的「验收语句」逐条验收，并在正文注明增补部分。
- MUST 让 `agents/qa.md` 明确 QA 增补验收语句属于测试设计建议；qa 通过交棒时 MUST 标注增补部分，且增补只有经需求持有者或真人用户明确接受后才并入验收清单。
- MUST 让 qa 不得替需求持有者或真人用户确认验收语句调整；通过交棒时只请求发起需求角色按原验收语句加 QA 增补验收方案，并明确是否接受这些增补。
- MUST 对不触碰运行时代码、外部依赖、状态机、agent 协作协议的纯文档 / 文案类方案豁免四步审查：qa MUST 输出一句话豁免（含理由）并直接 mention 发起需求角色。
- MUST 让 `agents/qa.md` 每条响应末尾以 `<!-- agent-moebius:stage=in-progress -->` 结尾，阶段语义用正文结论行表达，MUST NOT 为 qa 新增注册 stage。
- MUST 让 qa 对同一需求的方案最多判两轮不通过；第三轮仍有分歧时 MUST 列明分歧点、判"有保留通过"并交人类裁决，MUST NOT 与 dev 无限空转。
- MUST 提供 `docs/architecture/invariants.md` 作为系统级不变量事实源，至少覆盖 liveness（任何单点故障不得使心跳循环或任一 issue 推进永久停转；每个外部调用必须有界时或有看门狗）、safety（intake 游标只在 GitHub 留下可见结果后推进）、visibility（放弃或降级任务必须留下可见痕迹，且痕迹发布路径本身受前两者约束）三类。qa 发现新故障类时 MUST 以补丁建议形式回流，经人类确认后合并，MUST NOT 直接修改该文件。
- MUST 新增 `agents/ceo.md` 作为 CEO agent persona，承载触发范围、识别场景清单、输入契约、输出契约与修改红线；未来事故规则扩展 MUST 通过修改 `agents/ceo.md` 实现，NEVER 硬编码到 runner 或 `src/format-ceo.ts`。
- MUST 让 `agents/ceo.md` 至少覆盖九类识别场景（append 场景保持 persona 层判断）：① `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified` 时的阶段验收回流 / 缺验收语句补齐；② 工作明显未完成、或已交付但不符合规范（持续推进）；③ 交付规范细则不满足（如 PR 缺 `Closes #N` 字样、评论中 PR 不是链接形式）；④ 死锁等待——agent 的最新响应在等待一个不存在或不会响应的对象（如把历史 reflector 评论当真人、等待系统中不存在的 reviewer / manager），CEO 追加评论纠正认知并直接裁决下一步；⑤ PR 冲突——按 PR 真实状态核实规则核实到 `state=OPEN` 且 `mergeable=CONFLICTING` 的 PR 时，`append` 一条 `@dev` 修复冲突的评论，merged / closed 的 PR MUST 跳过，MUST NOT 做去重（每次验收看到冲突即提醒）；⑥ 免确认操作放行——`dev` 的 `latestResponse` 在向用户征求免确认清单内操作的同意时，`append as=ceo` 直接授权继续；⑦ qa 交棒兜底——`agent = qa` 的 `latestResponse` 含固定结论行但交棒 mention 缺失时补交棒，正常时 `no_change`；⑧ GitHub 交互协议违规纠偏——`latestResponse` 误用 `@` 进行纯提及或多重控制权移交、用裸 `#N` 表达非 issue / PR 编号、试图手写 runner 专属 role envelope，或需要提醒人工路由必须显式带一个合法 mention 时，CEO SHOULD 输出 `append`、`as=ceo`，指出违规点并给出合规写法；⑨ 验收治理违规——未经确认改写验收语句、调整验收范围、把 QA 增补当作已生效清单、或覆盖验收角色不通过结论时，CEO SHOULD 输出 `append`、`as=ceo`，要求需求持有者或真人用户确认。
- MUST 让 CEO 的 GitHub 交互协议违规纠偏保持 append-only；`agents/ceo.md` MUST NOT 为本场景启用 `replace`，以保留违规原文作为审计证据。
- MUST 让 `agents/ceo.md` 承载「PR 真实状态核实」要求：CEO 对 PR 下任何判断（交付规范细则、冲突、交付完成度）前，MUST 先对上下文中出现的完整 PR 链接 `https://github.com/<owner>/<repo>/pull/<n>` 在其 Codex 子进程内执行 `gh pr view <完整URL> --json title,body,state,mergeable,mergeStateStatus` 核实；MUST 使用完整 URL（CEO 运行目录不在目标仓库）；MUST NOT 仅凭评论文本猜测 PR 内容；`gh` 查询失败时 MUST NOT 基于猜测介入，保守输出 `no_change`（纯文本层即可确定的问题除外，如"评论中 PR 不是链接形式"）。PR 核实发生在 CEO Codex 子进程内部，属 persona 层行为，不经过 runner 的 GitHub adapter，不与"`src/format-ceo.ts` MUST NOT 自行调用 GitHub"红线冲突。
- MUST 让交付规范中 `Closes #N` 的检查对象为核实到的 PR body，而非评论文本。
- MUST 让 `agents/ceo.md` 承载免确认操作清单（授权边界只存在于 `agents/ceo.md`，`agents/dev.md` 行为不变）：清单内（CEO 直接放行）为从最新 `origin/main` 创建 feature 分支、把方案落盘到 `openspec/changes/`、方案经 qa 测试设计审查通过且发起需求角色验收通过后进入实现阶段（不再要求用户口头"开始写代码"）；清单外（仍等用户）包括但不限于 push、创建 / 合并 PR、任何删除类操作。
- MUST 让 `agents/ceo.md` 承载协作生态认知，至少包含：真实可通过 mention 触发的 Codex agent 清单（当前为 `dev`、`dev-manager`、`product-manager`、`hermes-user`、`secretary`、`tranfu-agents-manager`、`qa`）；系统中不存在 reflector、reviewer、manager 等可交互对象；历史 `<reflector>` / `stage-hook` 评论只作为旧公开上下文，不代表当前仍有可触发角色；各 agent 常犯错误的经验清单（至少含 dev：把历史 reflector 评论当真人汇报、等待不存在的角色、收到提醒后只做确认式回复无实质推进）。
- 未来新增 driver agent 时 MUST 同步更新 `agents/ceo.md` 生态认知章节的 agent 清单（与 `as` 允许集合的同步义务并列）。
- MUST 定义 `agents/ceo.md` 的输入契约字段：`issueContext`、`latestResponse`、`agent`、`allowedStages`。
- MUST 让 CEO `issueContext` 是完整公开 issue context，至少包含 `issueUrl = https://github.com/<owner>/<repo>/issues/<number>`、当前 issue body 原文 `issueBody`、以及按 GitHub 返回顺序排列的所有 comment body 原文 `comments`。
- MUST 让 CEO prompt 明确 `latestResponse` 是本轮唯一待发布的 agent 响应；`issueContext` 只用于理解用户全局流程、后续覆盖指令、历史上下文和交付规范。
- MUST 由 `src/runner.ts` 基于当前 `IssueSource` 与已拉取的 `GitHubIssue` 组装 CEO `issueContext`；`src/format-ceo.ts` MUST NOT 自行调用 GitHub、读取 `.state/*` 或读取本地 intake state。
- MUST 保留 comment body 中的隐藏 metadata 原文，包括 `role`、`stage`、历史 `stage-hook` 与 `ceo-corrected`，以便 CEO 判断 speaker、历史背景和循环防护背景。
- MUST NOT 在本 change 中新增独立 token 统计状态文件或新持久化机制；CEO token 成本观察沿用现有 Codex stdout JSONL 与 runDir 输出。
- MUST 定义 `agents/ceo.md` 的输出契约为 JSON，persona 层仅承载以下两种结构（允许 fenced code block 包裹）：
  1. `{"action":"no_change"}` — 不改动，runner 直接 post 原文。
  2. `{"action":"append","as":"<role>","body":"<CEO 追加正文>"}` — `as` MUST 在 `{ceo, dev, dev-manager, product-manager, hermes-user, secretary, qa}` 集合内，默认 `ceo`；`as=ceo` 时 body 不带 stage marker。
- `replace` action 保留在代码层（`src/format-ceo.ts` 的解析与 post-validate 不变），但 `agents/ceo.md` MUST NOT 被要求承载 `replace` 的触发场景与格式约束；未来需要恢复时通过修改 `agents/ceo.md` 实现。
- MUST 让 `format-ceo.ts` post-validate 只做基础格式红线校验：合法 JSON、`action` 枚举、`append.as` 已知 role、`replace.body` 末尾 stage marker、非空 body；MUST NOT 在 code 层做业务判据（触发条件、模板措辞、`@mention` 等），业务判据 MUST 全部由 `agents/ceo.md` 承担。
- MUST 在 `src/runner.ts` 的 mention Codex 分支于 `postComment` 之前插入 CEO 拦截：所有 Codex agent 生成的评论 MUST 走 CEO。
- MUST 通过评论 body 中的 `<!-- agent-moebius:ceo-corrected -->` metadata 识别 CEO 自身修正版评论；此机制 MUST NOT 依赖 runner 内存中的响应通道来源。
- MUST 让 runner 按 CEO 返回的 `action` 分支处理 post 逻辑：
  - `no_change`：直接 post 原文，body 末尾**不**追加 `<!-- agent-moebius:ceo-corrected -->`。
  - `replace`：在 CEO 返回的 `body` 末尾追加 `<!-- agent-moebius:ceo-corrected -->` metadata，走原 agent 前缀（`<原 agent>:` 可见 + `role=<原 agent>` metadata）post 一条。
  - `append`：先 post 原 `LAST_RESPONSE` 一条（`<原 agent>:` 可见 + `role=<原 agent>` metadata，**不**追加 `ceo-corrected`），再 post 一条独立评论（`<${as}>:` 可见 + `role=${as}` metadata + 末尾追加 `ceo-corrected` metadata）。
- MUST 让 CEO 调用以完整公开 issue context、无状态方式执行：每次 CEO 调用 MUST 新建 codex thread、NEVER 复用 dev thread、NEVER 复用上次 CEO thread。
- MUST 在收到 CEO `replace` 输出后执行后置宽容匹配验证：`body` 末尾 MUST 存在合规 `<!-- agent-moebius:stage=<enum> -->` marker，且 `<enum>` MUST 属于 `AllStages`；验证不通过 MUST fail-open 直接 post 原文。
- MUST 在 CEO 调用超时、抛异常、返回空、返回非法 JSON、`action` 字段缺失或不在 `{no_change, replace, append}` 枚举内、`append.as` 缺失或不在允许集合内、`replace.body` 或 `append.body` 为空、`replace.body` 末尾 stage marker 不在 `AllStages` 内时 fail-open 直接 post 原文；CEO guardrail MUST NOT 变成新的失败源阻断主流程。
- MUST 在 `format-ceo.ts` 的 `FAIL_OPEN` reason 中区分：`invalid-json`、`unknown-action`、`unknown-as`、`empty-body`、`post-validate-failed`、`codex-failed`、`codex-timeout`、`persona-load-failed`、`already-corrected`（no_change 类）。
- MUST 在 CEO 调用超时时取消对应底层 Codex 子进程，避免 fail-open 后仍留下后台 guardrail 进程继续运行。
- MUST 让 `format-ceo.ts` 的 `DEFAULT_CEO_TIMEOUT_MS = 300_000`，为 CEO 子进程内执行 `gh` 核实留出时长余量；超时取消子进程并 fail-open 发原文的语义不变。
- MUST 记录结构化日志覆盖 `event = "ceo-guardrail-repaired"`（`replace` 命中）、`event = "ceo-guardrail-appended"`（`append` 命中，含 `as` 字段）、`event = "ceo-guardrail-noop"`（`no_change`）、`event = "ceo-guardrail-failopen"`（fail-open），至少包含 `issueKey`、`agent`、`reason`。
- MUST 让 `src/conversation.ts` 的 `normalizeComment` 识别 `<!-- agent-moebius:role=ceo -->` metadata 并直接归为 `speaker=ceo`，**不走 `availableAgentNames` 白名单校验**；其他 role 仍走现有校验路径。
- MUST NOT 把 `ceo` 加进 `availableAgentNames`；CEO 不是 mention codex agent，`@ceo` 不应触发 codex 调用。
- MUST 让 CEO 规则进化入口是 `@secretary`，而不是 `@ceo` 普通触发。
- 未来新增 driver agent 时 MUST 同步扩 `agents/ceo.md` 的 `as` 允许集合并更新 `format-ceo.ts` 的 `CEO_APPEND_ROLES` 白名单。
- MUST 在 runner 写回 agent 评论时使用 GitHub 页面可见模板 `<role>:\n${LAST_RESPONSE}`，其中 `${LAST_RESPONSE}` 是 Codex 本轮最终 assistant 文本；落到 comment body 时 MUST 使用 `&lt;role&gt;:\n${LAST_RESPONSE}`，避免 GitHub Markdown 把 raw `<role>` 当作 HTML 标签处理。
- MUST 在 runner 写回 agent 评论时追加隐藏 metadata `<!-- agent-moebius:role=<role> -->`。
- MUST 仅在 Codex 成功且 GitHub 评论成功后更新 role thread 状态；失败时 MUST 保持旧状态，允许下一轮重试。
- MUST terminate the Codex child process when an agent-run interrupt fires, and MUST treat the interrupted run as unsuccessful even if the process exits cleanly afterward.
- MUST NOT post a GitHub comment or update `.state/role-threads.json` after an interrupted Codex run.
- MUST 在 resume 失败或 thread id 不可用时允许回退到 full prompt 新建 Codex thread，并在 GitHub 评论成功后更新该 role 的 thread 映射。
- MUST 把本地脚本每次执行的 stdout / stderr 落到 `<TMP_ROOT>/agent-moebius-<ISO>-c<count>-r<sequence>/` 下，并在日志中打印该路径，便于追溯；`<sequence>` 是 runner 进程内递增后缀，用于保证并发 runDir 唯一；resume fallback 可使用独立 fallback 目录。
- MUST 在本地脚本失败（非 0 退出 / 解析不出最终消息 / 无法取得必要 thread id）时只记日志、不发评论；下一轮若条件仍满足可再次尝试。
- MUST 通过 `child_process.spawn(cmd, args[])` 调用 codex 与 gh，prompt 作为 argv 项、评论 body 通过 stdin（`gh ... --body-file -`）注入，issue reaction 通过 `gh api` argv 参数数组添加；artifact publisher 若调用外部命令也 MUST 使用受控 argv 数组；MUST NOT 通过 shell 拼接。
- MUST 把 issue body / comment 内容当作不可信外部输入处理。
- MUST 让 prompt 构造、speaker 归一化、触发判定、delta 消息选择、评论格式化与状态更新计算保持为可单元测试的业务数据操作，不依赖 GitHub、Codex CLI 或文件系统。
- MUST NOT 把 GitHub token 或个人访问令牌写入仓库；当前实现复用本机 `gh auth login`。
- 当前 watched repositories 来自 `config.toml` 与 `config.local.toml`；tick 间隔、idle repo scan 间隔、active issue poll 间隔、issue scan limit、active issue 上限、本地 agent Markdown 目录、临时目录、role thread 状态文件路径、agent context 状态文件路径、GitHub response intake 状态文件路径、默认 workdir root、issue media 大小上限、output artifact 大小上限与默认 artifact release tag 集中在 `src/config.ts`。
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
And `<TMP_ROOT>/agent-moebius-<ISO>-c1-r<sequence>/` 下保留 codex 的 `stdout.jsonl` 与 `stderr.log`

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

### 场景 6.1：对话型 — fenced code block 内 mention 不触发
Given 最新消息只有 fenced code block 内包含 `@dev`
When 一次轮询取回该 issue
Then 系统不选择 `dev`
And 不调用 Codex driver

### 场景 6.2：对话型 — inline code 内 mention 不触发但普通文本 mention 仍触发
Given 最新消息包含 inline code `` `@dev` `` 作为示例
And 同一消息普通文本包含 `@product-manager`
When 一次轮询取回该 issue
Then 系统选择 `product-manager`

### 场景 7：stage marker 本身不触发 hook
Given 最新消息 speaker 是 `dev`
And 最新消息 body 包含 `<!-- agent-moebius:stage=plan-written -->`
And 最新消息 body 不包含任何有效 agent mention
When 一次轮询取回该 issue
Then 系统不调用 Codex
And 不发表评论

### 场景 7.1：Dev agent — plan-written 方案末尾包含验收语句
Given dev 正在产出 `plan-written` 方案
When dev 完成方案正文
Then 方案正文末尾包含「验收语句」一节
And 「验收语句」中至少包含 1 条可机械执行的检查
And UI 类检查使用 `打开 X → 做 Y → 应看到 Z` 格式
And 非 UI 类检查使用等价可执行断言格式，例如 `跑 X → 应输出/退出码 Z`
And 最终一行仍为合法 `<!-- agent-moebius:stage=plan-written -->` marker

### 场景 8：普通 @reflector mention 不触发
Given 最新消息 body 只包含 `@reflector`
And 仓库中不存在 `agents/reflector.md`
When 一次轮询取回该 issue
Then 系统不调用 Codex
And 不发表评论

### 场景 9：CEO 评论中的有效 mention 由普通 mention trigger 处理
Given 最新消息 speaker 是 `ceo`
And 最新消息 body 包含 `@dev`
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

### 场景 15.1：Secretary agent — 触发后固定当前仓库工作目录
Given 最新消息包含 `@secretary`
And `agents/secretary.md` frontmatter 声明 `preScript: src/agent-prescripts/current-repo-workspace.ts`
When 一次轮询取回该 issue
Then mention trigger 选择 `secretary`
And runner 执行 current repo preScript
And 以 agent-moebius 当前仓库根目录作为 Codex cwd 执行本轮
And 不创建 issue 独占 worktree
And 不写入 `.state/agent-contexts.json`

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

### 场景 22.1：GitHub response intake — failed 后保留游标并按失败预算重试
Given `.state/github-response-intake.json` 中 `tranfu-labs/agent-moebius#4.updatedAt = T1`
And repository scan 或 active poll 观察到该 issue 的 `updatedAt = T2`
When pre script 执行失败、Codex 执行失败或 GitHub comment 发布失败
Then 系统保持该 issue 的已处理 `updatedAt = T1`
And 保持或设置 `mode = active`
And 把 `failureCount` 累加 1
And 记录 `lastFailureReason`
And `activeNoChangeCount` 保持不变
And 把 `nextPollAt` 设为处理时间后 1 分钟
And 不更新 `.state/role-threads.json`
And 不发布 agent 评论

### 场景 22.2：GitHub response intake — 持续失败达预算后发布死信
Given `.state/github-response-intake.json` 中某 issue 的 `failureCount = 4`
And `FAILURE_RETRY_LIMIT = 5`
And 本轮处理再次失败
When runner 在同轮向该 issue 发布死信评论且发布成功
Then 结局折叠为 `dead-lettered`
And `updatedAt` 推进到本轮观察到的最新值
And `mode = idle`
And `failureCount` 与 `lastFailureReason` 被清零
And `nextPollAt = null`
And issue 上可见一条不含 agent mention、含 `<!-- agent-moebius:dead-letter -->`、失败原因与恢复提示的死信评论
And 用户之后的任意新评论能重新触发处理

### 场景 22.3：GitHub response intake — 死信发布失败不吞指令
Given 某 issue 失败已达预算且本轮处理再次失败
And 死信评论 `postComment` 抛出异常
When runner 折叠该次处理结局
Then 结局保持 `failed`
And `updatedAt` 不推进
And `failureCount` 保持累加后的值
And 后续轮次继续「先处理、后死信」
And 处理一旦成功则正常收敛且不发死信

### 场景 22.4：GitHub response intake — 故障恢复后不误发死信
Given 某 issue 因 GitHub 长时间故障 `failureCount` 已超过 `FAILURE_RETRY_LIMIT`
And 故障已恢复
When 下一轮到期先执行真实处理尝试且处理成功
Then 结局为 `triggered-success`
And 系统正常发布 agent 评论
And MUST NOT 发布死信评论
And `failureCount` 与 `lastFailureReason` 被清零

### 场景 23：agent 输出后不做同轮自反
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 含 `<!-- agent-moebius:stage=plan-written -->`
When 一次轮询取回该 issue
Then 系统按 mention trigger 运行 dev
And 在 `postComment` 前调用 CEO guardrail
And 按 CEO 返回的 action 发布 dev 原文或 CEO append
And runner 不会在本轮内把刚发布的评论再次交给 `resolveTrigger`
And 日志不包含任何 deterministic stage hook 生成或收敛事件

### 场景 24：CEO append 中的 mention 留给下一轮 active poll
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 含 `<!-- agent-moebius:stage=plan-written -->`
And CEO guardrail 返回 `{"action":"append","as":"ceo","body":"@product-manager 请按验收语句逐条验收方案"}`
When runner 发布 dev 原文和 CEO append 评论
Then 本轮不再次调用 product-manager
And 下一轮 active poll 读取到最新 CEO 评论时，普通 mention trigger 选择 `product-manager`

### 场景 27：Codex 执行反馈 — issue body 触发时 reaction 到 issue
Given issue body 包含 `@dev`
And 当前 issue 没有 comments
And `agents/dev.md` 存在
And prompt plan 需要执行 Codex
When runner 即将调用 `runCodex`
Then 系统先为当前 GitHub issue 添加 `eyes` reaction
And 日志中的 `targetSource = "issue-body"`、`targetIndex = 0`
And 随后调用 Codex driver

### 场景 27.1：Codex 执行反馈 — 最新 comment 触发时 reaction 到该 comment
Given issue body 不包含有效 trigger
And 最新 comment body 包含 `@dev`
And 该 comment 带有 GitHub node `id`
And `agents/dev.md` 存在
And prompt plan 需要执行 Codex
When runner 即将调用 `runCodex`
Then 系统先为最新 comment 添加 `eyes` reaction
And 不为 issue body 添加本轮 Codex execution reaction
And 日志中的 `targetSource = "comment"`、`targetIndex` 等于该 comment 在共享时间线中的 index
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

### 场景 30：Codex 执行反馈 — comment reaction 失败不阻断 Codex
Given runner 即将为最新 comment 添加 `eyes` reaction
And GitHub comment reaction API 调用失败
When runner 处理该失败
Then 系统记录 `event = "codex-execution-reaction-failed"` 与错误原因
And 继续调用 Codex driver
And role thread 状态仍只在 Codex 成功且最终 GitHub 评论成功后更新

### 场景 30.1：Issue media 输入 — full run 准备图片和视频
Given issue body 包含 `@dev`
And issue body 或 comments 中包含可下载的图片 URL 与视频 URL
And `.state/role-threads.json` 中没有当前 issue + `dev` 状态
When runner 即将首次调用 Codex
Then 系统从完整公开 timeline 提取媒体引用
And 将媒体下载到当前 runDir 的 `input-media/`
And 通过 `--image <file>` 传入图片
And 在 prompt media manifest 中列出视频本地路径
And 不把输入媒体写入目标 worktree、`agents/` 或 `.state/`

### 场景 30.2：Issue media 输入 — resume 只包含新增外部消息媒体
Given `.state/role-threads.json` 中已有当前 issue + `dev` 的 `lastSeenIndex = 2`
And 最新用户 comment 包含 `@dev` 与一个图片 URL
And 历史消息中还存在另一个视频 URL
When runner 使用 `codex exec resume <threadId>`
Then 本轮 media preparation 只处理 index 大于 2 且 speaker 不是 `dev` 的新增外部消息中的媒体
And 历史视频 URL 不重复进入本次 media manifest

### 场景 30.3：Issue media 输入 — 下载或校验失败时发布错误评论
Given 最新消息包含 `@dev` 和一个不支持或不可下载的 media URL
When runner 在 Codex 启动前准备媒体失败
Then 系统发布一条带当前 agent role envelope 的可见错误评论
And 不调用 Codex driver
And 不更新 `.state/role-threads.json`
And intake 把本次触发视为已处理，避免同一坏链接每分钟重复刷屏

### 场景 30.3.1：Issue media 输入 — SVG 引用被过滤
Given issue timeline 中包含 `.svg` URL
And URL 分别出现在 Markdown image、Markdown link、HTML `src` 与 bare URL 中
When runner 提取本轮 issue media references
Then 这些 SVG URL 均不会出现在提取结果中
And 非 SVG 图片 / 视频 URL 仍按既有规则提取

### 场景 30.4：输出 artifact — 生成 SVG / 图片 / 视频后可在 comment 直接查看
Given Codex 成功完成且在 runDir 或最终回复引用中产生支持的 SVG、图片或视频 artifact
When runner 发布 agent comment 前处理输出 artifact
Then 系统将 artifact 复制到 `output-artifacts/`
And 通过 artifact publisher 发布到同仓库 GitHub release tag `agent-moebius-artifacts`
And 把可直接查看的 Markdown 预览追加到 `latestResponse`
And CEO guardrail 看到的是已追加 artifact 预览的 `latestResponse`
And 生成 artifact 不会被提交到业务仓库

### 场景 30.5：输出 artifact — 发布失败时不伪装成功
Given Codex 成功完成且产生了需要发布的 artifact
And artifact publisher 上传失败
When runner 处理该失败
Then 系统发布一条带当前 agent role envelope 的可见错误评论
And 不发布声称 artifact 已交付的 agent comment
And 不更新 `.state/role-threads.json`

### 场景 31：Dev agent — 新 comment 打断正在运行的 Codex
Given 最新消息触发 `@dev`
And runner 已基于当前 timeline 启动 Codex
When Codex 尚未完成时该 issue 新增一条 comment
Then runner 中断该 Codex 子进程
And 不发布该次 Codex 的 GitHub comment
And 不更新该 issue + `dev` 的 role thread state
And intake state 保持该 issue active，等待下一轮用包含新 comment 的 timeline 重新处理

### 场景 32：中断检测 — driver 只提供 conversation snapshot
Given 一个 driver 可以读取当前 conversation message count
When 当前 message count 大于 Codex 启动时的 baseline message count
Then 通用中断 monitor 产生 `new-message` interrupt
And monitor 不需要知道该 driver 是否来自 GitHub

### 场景 32.1：driver pool — 默认不限制并发
Given runner 构造 driver pool 时未传入 `maxConcurrent`
And 同一 tick 中有 3 个不同 issue processing jobs 到期
When runner 把这些 jobs 提交给 driver pool
Then driver pool 不施加额外并发上限
And 这些 jobs 可以在同一 tick 内同时进入 running 状态

### 场景 32.2：driver pool — 显式 maxConcurrent 限制并发
Given runner 构造 driver pool 时传入 `maxConcurrent = 2`
And 同一 tick 中有 3 个不同 issue processing jobs 到期
When runner 把这些 jobs 提交给 driver pool
Then 任意时刻最多 2 个 jobs running
And 前 2 个 jobs 中任一个完成后，第 3 个 job 才开始 running

### 场景 32.3：driver pool — 并发 issue jobs 完成即独立折叠
Given 同一轮心跳中 issue A 与 issue B 都到期
And 两个 jobs 通过 driver pool 并发执行
When issue A 的 job 先完成
Then A 的 outcome 立即折叠进内存 intake state 并调度落盘，不等待 B
And B 完成后其 outcome 同样折叠，`.state/github-response-intake.json` 同时保留 A 与 B 的处理结果
And 任一 job 的完成先后顺序不改变各自折叠结果

### 场景 32.7：心跳解耦 — 长跑 job 不阻塞其他 issue
Given issue #67 的 dev job 正在执行一个长跑 Codex（数分钟未结束）
And issue #68 在此期间收到包含有效 trigger 的新评论
When 下一次心跳到来
Then 心跳正常完成仓库扫描并发现 #68 的变化
And #68 的 job 被派发并全流程处理完成（评论、折叠、落盘）
And 日志不出现因 #67 长跑导致的连排 `skip-overlap`

### 场景 32.8：心跳解耦 — in-flight issue 防重复派发
Given issue #67 的 job 正在执行
And 后续心跳再次把 #67 判定为 due（`updatedAt` 变化或 active poll 到期）
When 心跳尝试派发 #67
Then 系统记录 `event = "skip-inflight"` 与 `issueKey`
And 不为 #67 启动第二个并发 job
And #67 的 job 完成折叠后，下一次心跳依据新状态重新推导是否需要再次处理

### 场景 32.4：driver pool — 并发 Codex 成功不会覆盖 role thread state
Given issue A 的 `dev` Codex run 与 issue B 的 `product-manager` Codex run 并发成功
And 两者都成功发布 GitHub 评论
When 两者更新 `.state/role-threads.json`
Then 写入通过 issue + role entry merge 串行完成
And state file 同时包含 issue A + `dev` 的 thread state 与 issue B + `product-manager` 的 thread state

### 场景 32.5：driver pool — 并发 dev pre script 不会覆盖 agent context state
Given issue A 的 `dev` pre script 与 issue B 的 `dev` pre script 并发创建各自 worktree context
When 两者更新 `.state/agent-contexts.json`
Then 写入通过 issue + role entry merge 串行完成
And state file 同时包含 issue A + `dev` 与 issue B + `dev` 的 context entry

### 场景 32.6：driver pool — 并发 Codex run 不复用同一个 runDir
Given issue A 与 issue B 在同一 runner 进程内并发启动 Codex
And 两个 issue 的 conversation message count 相同
And 两个 run 在同一 timestamp interval 内创建 runDir
When runner 调用 `makeRunDir`
Then 两个 runDir MUST 不相等
And 两个 run 的 stdout / stderr MUST 写入不同目录

### 场景 33：CEO guardrail — dev 漏发 stage marker 被 CEO 补齐
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 正文明显对应 `code-verified` 阶段但末尾无 `<!-- agent-moebius:stage=code-verified -->` marker
And CEO 输出 `replace` 修正（代码层保留的能力，当前 `agents/ceo.md` 不再主动承载该场景）
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 以完整公开 issue context（`issueContext` + `latestResponse` + `agent = "dev"` + `allowedStages`）被调用
And CEO 返回改写后完整文本，末尾含 `<!-- agent-moebius:stage=code-verified -->`
And 后置宽容匹配验证通过
And runner 在 post 前追加 `<!-- agent-moebius:ceo-corrected -->` metadata
And runner post 的评论为 CEO 修正版，包含 CEO quote 标注、stage marker、role metadata、以及最终位于 body 最末尾的 `<!-- agent-moebius:ceo-corrected -->` metadata
And 日志包含 `event = "ceo-guardrail-repaired"` 与 `issueKey`
And 后续不会触发任何 deterministic stage hook

### 场景 34：CEO guardrail — CEO 返回 no_change 直接 post 原文
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾已含合规 `<!-- agent-moebius:stage=in-progress -->`
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 返回 `{"action":"no_change"}`（含前后空白或 markdown fence 包裹均视同合法 JSON）
And runner post 的评论为 dev 原文，不追加 CEO quote 标注
And 日志包含 `event = "ceo-guardrail-noop"`

### 场景 35：CEO guardrail — 后置验证不通过 fail-open
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 无合规 marker
When runner 调用 CEO guardrail
Then CEO 返回一段“修正文本”，但末尾不含 `AllStages` 内的任何合规 marker
And 后置宽容匹配验证不通过
And runner fail-open post dev 原文
And 日志包含 `event = "ceo-guardrail-failopen"` 与 `reason = "post-validate-failed"`

### 场景 36：CEO guardrail — CEO 超时或异常 fail-open
Given 最新消息包含 `@dev`
When runner 调用 CEO guardrail 并遇到超时、CLI 非 0 退出、返回空 stdout 或返回非法输出
Then runner fail-open post dev 原文
And 日志包含 `event = "ceo-guardrail-failopen"` 与错误原因
And 若失败原因为超时，runner 取消对应底层 Codex 子进程
And 不阻断主流程，不影响 role thread 状态推进条件

### 场景 37：CEO guardrail — CEO 自身评论通过 metadata 识别不再走 CEO 防循环
Given CEO 修正评论已 post，body 含 `<!-- agent-moebius:ceo-corrected -->` metadata
When runner 后续从 GitHub 读到该评论并进入 CEO 拦截入口
Then runner 通过 body 中 `<!-- agent-moebius:ceo-corrected -->` metadata 识别为 CEO 修正版
And runner MUST NOT 再对该评论触发 CEO guardrail
And 该识别机制不依赖 runner 内存中的响应通道来源，runner 重启后仍能正确识别

### 场景 38：CEO guardrail — plan-written 先派 qa 测试设计审查
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- agent-moebius:stage=plan-written -->`
And `${LAST_RESPONSE}` 的最终 stage marker 前包含「验收语句」小节
And 「验收语句」小节内包含逐条、可机械执行的检查
And 完整公开 issue context 明确写明发起本需求角色是 `hermes-user`
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And append body MUST mention `@qa` 要求按测试设计流程审查本轮方案
And append body MUST NOT mention 发起需求角色
And runner 先 post dev 原文，再以 `<ceo>:` 前缀 post CEO 追加评论
And 日志包含 `event=ceo-guardrail-appended` 与 `as=ceo`

### 场景 38.2：CEO guardrail — dev 重出方案后 qa 重审（历史结论不复用）
Given qa 曾对旧 `plan-written` 输出 `QA 结论：不通过`
And dev 修正后本轮重新返回带 `<!-- agent-moebius:stage=plan-written -->` 且验收语句齐全的新方案
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO MUST 返回 `append`、`as=ceo`，正文 mention `@qa` 审查新方案
And CEO MUST NOT 复用历史 qa 结论直接回流发起需求角色

### 场景 38.3：CEO guardrail — qa 通过但漏交棒时兜底
Given `agent = qa` 的 `${LAST_RESPONSE}` 含结论行 `QA 结论：通过`
And 正文没有 mention 发起需求角色
And 完整公开 issue context 明确写明发起本需求角色是 `product-manager`
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO MUST 返回 `append`、`as=ceo`，正文 mention `@product-manager`
And append body MUST 要求按含 QA 增补的「验收语句」逐条验收方案

### 场景 38.4：CEO guardrail — qa 交棒正常时不重复介入
Given `agent = qa` 的 `${LAST_RESPONSE}` 含结论行 `QA 结论：不通过`
And 正文已 mention `@dev` 并逐条列出挂靠故障矩阵格 / 不变量条目的缺陷
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO MUST 输出 `{"action":"no_change"}`

### 场景 38.5：qa persona — 抓出方案未覆盖的故障格
Given 待审方案对某外部子进程调用只定义了"失败即报错重试"分支
And `docs/architecture/invariants.md` 含 liveness 不变量（每个外部调用必须有界时）
When qa 按 `agents/qa.md` 执行故障矩阵审查
Then qa 点名「该子进程 × 永久挂起」为未覆盖格
And 结论行为 `QA 结论：不通过`
And 评论 mention `@dev` 且缺陷条目挂靠该矩阵格与 liveness 条目

### 场景 38.6：qa persona — 纯文档方案一句话豁免
Given 待审方案只修改 README 与注释、不触碰运行时代码 / 外部依赖 / 状态机 / 协作协议
When qa 按 `agents/qa.md` 审查该方案
Then qa 输出一句话豁免（含理由）并 mention 发起需求角色
And qa MUST NOT 产出经验假设清单与故障矩阵长文
And 响应末尾 stage marker 为 `<!-- agent-moebius:stage=in-progress -->`

### 场景 38.1：CEO guardrail — plan-written 缺验收语句时要求 dev 补齐
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- agent-moebius:stage=plan-written -->`
And `${LAST_RESPONSE}` 没有「验收语句」小节，或该小节内没有逐条、可机械执行的检查
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And append body MUST mention `@dev`
And append body MUST 要求 `@dev` 补齐「验收语句」
And append body MUST NOT mention 验收角色要求其验收当前方案

### 场景 39：CEO guardrail — code-verified 回流给发起需求角色验收实现证据
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- agent-moebius:stage=code-verified -->`
And 完整公开 issue context 中存在一条历史 dev `plan-written` 方案
And 该方案包含「验收语句」小节与逐条、可机械执行的检查
And 完整公开 issue context 明确写明发起本需求角色是 `product-manager`
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And append body MUST mention `@product-manager`
And append body MUST 要求 `@product-manager` 按验收语句逐条验收实现证据
And runner 先 post dev 原文，再以 `<ceo>:` 前缀 post CEO 追加评论
And 日志包含 `event=ceo-guardrail-appended` 与 `as=ceo`

### 场景 39.1：CEO guardrail — 非 dev 普通 agent 也走 CEO
Given 最新消息 mention 的是 `product-manager`、`hermes-user` 或 `secretary`
And 该 agent 的 codex 响应 `${LAST_RESPONSE}` 无合规 stage marker
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 以完整公开 issue context（含对应 `agent` 值）被调用
And runner 按 CEO 返回的 action 分支处理 post 逻辑

### 场景 39.2：CEO guardrail — CEO 读取完整公开 issue context
Given 最新消息包含 `@dev`
And issue body 为 `全局流程：先采访再方案`
And comments 依次包含 `临时修改：本次不需要额外 token 统计` 与一条历史 `reflector` stage-hook metadata 评论
When runner 在 `postComment` 之前调用 CEO guardrail
Then `formatCeoComment` 的输入包含 `issueContext.issueUrl = "https://github.com/<owner>/<repo>/issues/<number>"`
And `issueContext.issueBody = "全局流程：先采访再方案"`
And `issueContext.comments` 按原顺序包含两条 comment body 原文
And 不再包含 `lastReflectorHook` 字段；历史 hook 评论只作为 `issueContext.comments` 原文背景存在

### 场景 39.3：CEO prompt — latestResponse 仍是唯一待发布对象
Given CEO prompt 包含完整公开 issue context
And `latestResponse` 为当前 Codex agent 本轮输出
When CEO 判断是否需要 `no_change`、`replace` 或 `append`
Then CEO MUST 只校正或追加围绕 `latestResponse` 的发布行为
And issueContext 中的历史 agent 评论 MUST 只作为背景，不得被当成本轮待发布正文直接改写。

### 场景 39.4：验收角色 — 方案阶段逐条验收并指出失败项
Given CEO guardrail 或用户最新消息 mention `@product-manager`
And 消息要求按 dev `plan-written` 方案末尾的「验收语句」验收方案
And 验收请求包含 3 条验收语句
And dev 方案明显未覆盖其中 1 条验收语句
When product-manager 响应验收请求
Then 响应必须逐条输出 3 行结论
And 每行必须包含 `通过` 或 `不通过` 与依据
And 失败项必须 mention `@dev`
And 失败项必须说明未过语句与期望差异
And 最后一行必须是 `<!-- agent-moebius:stage=in-progress -->`

### 场景 39.5：验收角色 — 代码阶段按 dev 证据逐条验收
Given CEO guardrail 或用户最新消息 mention `@hermes-user`
And 消息要求按历史方案中的「验收语句」验收 dev `code-verified` 实现
And dev 响应提供测试输出、文件路径或截图 artifact 作为证据
When hermes-user 响应验收请求
Then 响应必须逐条输出每条验收语句的通过 / 不通过结论
And 每条依据必须引用 dev 提供的证据或指出缺少证据
And 全部通过时必须声明验收通过
And 必须说明下一步等待谁
And 最后一行必须是 `<!-- agent-moebius:stage=in-progress -->`

### 场景 40：Stage 契约扩展 — in-progress 不强制 CEO append
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- agent-moebius:stage=in-progress -->`
And 不命中 `agents/ceo.md` 中其他 append 识别场景
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 返回 `{"action":"no_change"}`
And runner 只 post dev 原文，不额外发布 CEO 追加评论

### 场景 41：Stage 契约扩展 — stage marker 宽容匹配只服务契约校验
Given 一个 Codex agent 响应末尾含 `<!--  agent-moebius:stage = code-verified  -->`
When 系统解析尾部 stage marker
Then 识别为 `code-verified` stage
And 该识别只用于 agent/CEO 输出契约校验，不生成确定性 hook 评论

### 场景 42：CEO guardrail — dev 询问可自主裁决问题被 CEO append 同意
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 停下询问"是否从当前 HEAD 创建 `change/foo` 分支"并以 `<!-- agent-moebius:stage=in-progress -->` 结尾
And CEO 判定需要追加评论（走 `append`）
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 返回 `{"action":"append","as":"ceo","body":"> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。\n\n@dev 同意你提出的分支方案，请自行创建并继续推进 plan-written。"}`
And 后置校验通过（合法 JSON、`action=append`、`as=ceo` 在允许集合、`body` 非空）
And runner 先 `postComment` 一次：body 为 dev 原文 + `role=dev` metadata（**不追加** `ceo-corrected`）
And runner 再 `postComment` 一次：body 为 `<ceo>:\n${CEO body}` + `role=ceo` metadata + `ceo-corrected` metadata
And 下一轮从 GitHub 拉取评论后，timeline 依次归一化为 `speaker=dev` → `speaker=ceo`
And 日志包含 `event=ceo-guardrail-appended` 与 `agent=dev` / `as=ceo` / `issueKey`

### 场景 43：CEO guardrail — CEO 扮演 dev 追加评论
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 停下询问"是否创建 change 分支"并以 `<!-- agent-moebius:stage=in-progress -->` 结尾
And CEO 判定应扮演 dev 直接推进（`as=dev`）
When runner 调用 CEO guardrail
Then CEO 返回 `{"action":"append","as":"dev","body":"> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。\n\n我自行按 change/foo 分支方案继续推进 plan-written。\n\n<!-- agent-moebius:stage=in-progress -->"}`
And 后置校验通过（`as=dev` 在允许集合、`body` 非空；code 层不校验 stage marker，是 dev 语义自带）
And runner 先 post dev 原文，再 post 一条 `<dev>:\n${CEO body}` + `role=dev` metadata + `ceo-corrected` metadata 的评论
And 下一轮从 GitHub 拉取评论后，timeline 依次归一化为两条 `speaker=dev` 评论，第二条含 `ceo-corrected` metadata
And 日志包含 `event=ceo-guardrail-appended` 与 `as=dev`

### 场景 44：CEO guardrail — 非法 JSON fail-open
Given 最新消息包含 `@dev`
When runner 调用 CEO guardrail
And CEO 返回一段自然语言解释而非 JSON
Then `parseCeoOutput` 判定为非法 JSON
And `FormatCeoResult.action = "FAIL_OPEN"` 且 `reason = "invalid-json"`
And runner fail-open 直接 post dev 原文（单次 `postComment`）
And 日志包含 `event=ceo-guardrail-failopen`

### 场景 45：CEO guardrail — `append.as` 未知 role fail-open
Given 最新消息包含 `@dev`
When runner 调用 CEO guardrail
And CEO 返回 `{"action":"append","as":"nobody","body":"..."}`
Then `format-ceo.ts` post-validate 拒绝
And `FormatCeoResult.action = "FAIL_OPEN"` 且 `reason = "unknown-as"`
And runner fail-open 直接 post dev 原文
And 日志包含 `event=ceo-guardrail-failopen`

### 场景 46：CEO speaker 命名空间独立于 mention 白名单
Given issue timeline 里有一条 body 含 `<!-- agent-moebius:role=ceo -->` 的评论
And `availableAgentNames = ["dev", "product-manager", "hermes-user"]`（不含 `ceo`）
When `normalizeComment` 处理该评论
Then 该评论归一化为 `speaker=ceo`
And 该评论 body 不会因 `@ceo` mention 触发 codex 调用（`ceo` 不在 mention agent 集合内）

### 场景 47：CEO guardrail — dev 死锁等待不存在的角色被 CEO append 裁决
Given dev 收到历史 plan-written reflector hook
And dev codex 本轮返回的 `${LAST_RESPONSE}` 为 `@reflector 这是重复的 plan-written hook……当前状态：等待 reviewer/manager 确认后进入实现阶段`
When runner 调用 CEO guardrail
Then CEO 依据 `agents/ceo.md` 协作生态认知识别出 dev 在等待不存在 / 不会响应的对象
And 返回 `{"action":"append","as":"ceo","body":"..."}`，body 纠正认知（当前系统不存在可交互 reflector、reviewer、manager）并裁决下一步（方案已通过反思，直接进入实现）
And runner 先 post dev 原文，再以 `<ceo>:` 前缀 post CEO 裁决评论

### 场景 48：收尾中断检查瞬时失败时 fail-open 照常发布
Given `dev` agent 的 codex run 已成功产出最终文本
And 收尾中断检查再次拉取 issue 时 GitHub CLI 因瞬时错误（如 `EOF`）在重试耗尽后仍抛异常
When runner 处理该收尾检查异常
Then 系统记录 `event = "agent-run-interrupt-check-failopen"`
And 视作未观察到新消息，继续执行 CEO guardrail 与评论发布
And MUST NOT 返回 `failed`、MUST NOT 丢弃已完成的 codex 产出

### 场景 49：瞬时 GitHub 故障不推进 intake 游标并在下一 tick 重入
Given `tranfu-labs/agent-moebius#4.mode = active` 且 `activeNoChangeCount = 3`
And 一次 active poll 拉取该 issue 时遇到 `transient` GitHub CLI 失败且调用内重试耗尽
When runner 折叠该次处理结局
Then 该 issue 的 `activeNoChangeCount` 保持 3（不累加）
And `updatedAt` 保持原值（不推进）
And `failureCount` 累加 1
And `lastFailureReason` 记录 GitHub CLI 失败原因
And `mode` 保持 `active` 并排下一次 poll
And 后续 poll 成功拉取到仍存在的变化时重新进入处理

### 场景 49.1：GitHub CLI 子进程挂起不会无限等待
Given runner 正在通过 GitHub adapter 执行一次只读 `gh` CLI 调用
And 该 `gh` 子进程一直不退出
When 单次调用 timeout 到期
Then 系统终止该 `gh` 子进程
And 本次尝试按 transient 失败进入有限 retry 或最终上抛
And 对应心跳或 issue job 不会永久等待该子进程

### 场景 49.2：持续 GitHub 网络故障最终死信或恢复
Given 某 issue 的最新消息需要处理
And fake GitHub adapter 持续抛出网络错误
When runner 多轮处理该 issue
Then 每轮失败都不推进该 issue 的 intake `updatedAt`
And 心跳仍能继续扫描 / 派发其他 due issue
And 失败达预算后，死信评论发布成功时该 issue 折叠为 `dead-lettered`
And 若预算轮处理恢复成功，则正常 `triggered-success` 且不发布死信

### 场景 50：codex run 超时看门狗判 failed
Given `dev` agent 的 codex run 运行时长超过 `CODEX_RUN_MAX_DURATION_MS`
When 看门狗触发并通过 `AbortController` 中止该 run
Then 系统记录 `event = "codex-watchdog-timeout"`
And 该次处理判为 `failed`（而非 `interrupted`）
And 该 issue 从 in-flight 集合释放，避免永久 `skip-inflight`

### 场景 50.1：Codex 子进程卡死时 watchdog 释放名额
Given `dev` agent 的 Codex run 子进程不产生最终结果且不自行退出
And fake driver promise 在收到 abort 后仍永不返回
When 运行时长超过 `CODEX_RUN_MAX_DURATION_MS`
Then watchdog abort 当前 Codex run 并记录 `codex-watchdog-timeout`
And 该 issue processing outcome 为 `failed`
And issue 从 in-flight 集合移除
And driver pool 后续 queued job 能继续启动

### 场景 51：CEO 核实到 PR 冲突
Given issue 上下文中出现一个完整 PR 链接，该 PR `state=OPEN` 且 `mergeable=CONFLICTING`
When runner 调用 CEO guardrail 校正本轮 agent 响应
Then CEO 在其 Codex 子进程内执行 `gh pr view` 核实后返回 `append`
And 追加评论正文 `@dev` 要求修复冲突

### 场景 52：PR 无冲突且格式合规
Given 上下文中的 PR `state=OPEN`、`mergeable=MERGEABLE`，且核实到的 PR body 含 `Closes #N`
When runner 调用 CEO guardrail
Then CEO 返回 `no_change`

### 场景 53：dev 征求免确认清单内操作的同意被直接放行
Given `dev` 的 `latestResponse` 在向用户征求"从最新 `origin/main` 创建 feature 分支"的同意
When runner 调用 CEO guardrail
Then CEO 返回 `append`（`as=ceo`）
And 追加评论正文直接授权 `@dev` 继续执行该操作，不等用户

### 场景 54：dev 征求清单外操作的同意不被放行
Given `dev` 的 `latestResponse` 在向用户征求"是否可以 push"的同意
When runner 调用 CEO guardrail
Then CEO 不因免确认放行场景介入（`no_change`，除非命中其他识别场景）

### 场景 55：gh 核实失败时保守处理
Given 上下文中出现 PR 链接但 CEO 子进程内 `gh pr view` 执行失败
When runner 调用 CEO guardrail
Then CEO MUST NOT 基于猜测对该 PR 下判断
And 仅纯文本层可确定的问题（如评论中 PR 不是链接形式）仍可介入

### 场景 56：协议文档包含核心规则与例子
Given 开发者打开 `docs/protocols/github-interaction.md`
Then 文档包含 `@` 控制权移交规则与 `#数字` 真实 issue / PR 引用规则
And 文档包含 runner 专属 role envelope 规则与人工路由必须带合法 mention 规则
And 文档包含验收截图引用契约与验收治理规则
And 每条核心规则都包含正例、反例与合规改写

### 场景 57：所有 persona 引用全局协议
Given 仓库存在 `agents/*.md`
When 运行 `rg -l "github-interaction|交互协议" agents/`
Then 每个 persona 文件都被命中

### 场景 58：CEO append-only 纠正协议违规
Given `dev` 的 `latestResponse` 把 `@dev` 用作纯提及
And 同一响应把任务编号写成 `#3`
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文指出 `@` 只能用于控制权移交、任务编号应写成 `T3`
And CEO MUST NOT 输出 `replace`

### 场景 59：CEO 纠正评论编号与验收编号的裸 `#N`
Given agent 响应用 `#6` 指代第 6 条评论
And 同一响应用 `#1` 指代验收语句编号
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文给出「第 6 条评论」与「验收语句 1」等文字形式改写

### 场景 59.1：协议与 persona 包含验收治理规则
Given 开发者打开 `docs/protocols/github-interaction.md`
Then 文档包含验收语句变更须由需求持有者或真人用户确认的规则
And 文档说明确认记录必须清晰落在 issue 时间线
And 文档说明沉默、继续执行、执行方自述、执行方转述、loop watcher 代述都不是有效确认
And 开发者打开 `agents/ceo.md`、`agents/dev.md`、`agents/product-manager.md`、`agents/hermes-user.md`、`agents/qa.md`
Then persona 包含各自对验收治理的最小职责补充

### 场景 59.2：CEO 介入未经确认的验收语句改写与自判通过
Given 完整公开 issue context 中原始验收语句为“打开协议 / persona 文件 → 应看到验收语句变更须需求持有者或用户确认”
And 需求持有者是 `product-manager`
And `dev` 或 loop watcher 的最新响应把该验收语句改写为“打开协议文件即可”
And 同一响应基于改写后的语句自判通过
And issue 时间线中没有 product-manager 或真人用户对该改写的明确确认
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文指出验收语句变更未经需求持有者或用户确认
And append 正文要求 `@product-manager` 表态是否接受该变更
And CEO MUST NOT 直接替 product-manager 改写新验收语句

### 场景 59.3：转述确认但时间线无确认记录时 CEO 介入
Given 执行方声称“已确认调整验收语句”
And 完整 issue 时间线中没有需求持有者或真人用户对该调整的明确确认记录
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文指出确认记录不可追溯
And append 正文要求需求持有者或真人用户表态

### 场景 59.4：loop watcher 未经确认缩小验收范围时 CEO 介入
Given loop watcher 未经确认把验收范围从“协议 / persona 文件”缩小为“协议文件”
And loop watcher 声明该缩小后范围可以放行
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文要求需求持有者或真人用户确认
And CEO MUST NOT 直接替需求持有者改写新验收语句

### 场景 59.5：未经确认扩大验收范围后自判通过时 CEO 介入
Given 执行方未经确认新增一条验收语句
And 执行方基于新增后的清单声明全部通过
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文指出新增验收语句未经确认
And append 正文要求需求持有者表态

### 场景 59.6：覆盖验收角色不通过结论需要确认
Given product-manager 或 hermes-user 按已确认验收语句输出某条 `不通过` 结论
And dev 或 loop watcher 后续声明“本次 override 该不通过结论，视为通过”
And issue 时间线中没有 product-manager 或真人用户对该 override 的明确确认
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文指出 override 未经需求持有者或用户确认
And append 正文要求需求持有者或用户明确表态

### 场景 59.7：已确认的 QA 增补并入验收清单
Given qa 对 dev 方案输出 `QA 结论：通过`
And qa 正文标注 1 条验收语句增补
And product-manager 随后在 issue 时间线明确写出“接受 QA 增补的验收语句……”
When 后续验收角色按验收语句逐条验收
Then 该 QA 增补视为已确认验收语句
And 验收角色 MUST 对该增补输出通过 / 不通过结论与依据

### 场景 59.8：未确认的 QA 增补不能被执行方直接当作生效清单
Given qa 对 dev 方案输出 1 条验收语句增补
And issue 时间线中没有需求持有者或真人用户明确接受该增补
When dev 在实现或 code-verified 回复中把该增补作为已生效验收清单并自判通过
Then CEO MUST 输出 `append`、`as=ceo`
And append 正文要求需求持有者或用户确认是否接受该 QA 增补

### 场景 59.9：需求持有者主动调整但仍需时间线记录
Given product-manager 是本需求持有者
When product-manager 在 issue 时间线明确写出“确认调整验收语句为……”
Then 后续 dev 与验收角色可以基于调整后的验收语句推进
And 该确认记录本身必须保留在 issue 时间线，不能只由 dev 或 loop watcher 转述

### 场景 59.10：验收治理规则不改运行时代码路径
Given 本次变更只要求协议、persona 与 OpenSpec 事实源更新
When 实现完成后运行 `git diff --name-only`
Then 输出中不包含 `src/` 运行时代码路径

### 场景 60：Observer — 白名单 issue 与阶段状态可见
Given `config.local.toml` 包含 `tranfu-labs/agent-moebius`
And 本地状态包含 `tranfu-labs/agent-moebius#50` 的记录
When 用户运行 `pnpm observer` 并打开本地页面
Then 页面显示 issue `50`
And 页面按来源标注 intake、role thread、agent context 与 run manifest 中可用的阶段 / 状态数据

### 场景 61：Observer — 有发布截图的 issue 显示预览或链接
Given `.state/run-manifests.jsonl` 包含 `tranfu-labs/agent-moebius#50` 的 record
And 该 record 包含 `publishedUrl` 非空且看起来是图片 URL 的 artifact
When observer 页面渲染该 issue
Then 页面显示该 published URL
And 页面为该 artifact 渲染图片预览

### 场景 62：Observer — 未发布 artifact 显示只读路径
Given `.state/run-manifests.jsonl` 包含 `path = "output-artifacts/t4.png"` 的 artifact
And `publishedUrl = null`
When observer 页面渲染该 run
Then 页面把该 artifact 标为“未发布”
And 页面显示 `output-artifacts/t4.png`
And observer 不尝试发布或 serve 该本地文件

### 场景 63：Observer — 坏 JSONL 行不让页面崩溃
Given `.state/run-manifests.jsonl` 包含一行损坏 JSON
And 后续行包含有效 manifest records
When observer 页面渲染
Then 有效 records 仍被显示
And 诊断区指出被跳过的损坏行

### 场景 64：Observer — 没有记录与读取失败可区分
Given 一个白名单 repository 没有本地 issue 记录
And `.state/role-threads.json` 存在但内容损坏
When observer 页面渲染
Then 空 repository 显示“没有记录”状态
And 诊断区单独显示 `role-threads.json` 读取或解析失败

### 场景 65：Observer — 观察页进程被强杀不影响 runner
Given observer server 正在运行
When observer 进程被强杀
And 随后触发一轮 runner heartbeat
Then runner heartbeat 与 issue processing 不 import 或依赖 observer modules
And runner 日志没有 observer 相关错误

### 场景 66：Observer — 缺失状态文件是 missing 而不是读取失败
Given 本地配置中存在一个白名单 repository
And `.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/run-manifests.jsonl` 均缺失
When observer 页面渲染
Then 页面成功返回
And 该 repository 显示“没有记录”状态
And 诊断区把这些 state files 分类为 missing，而不是读取失败

### 场景 67：Observer — 损坏状态与缺字段 manifest 保留合法记录
Given 一个 state JSON 文件损坏
And `.state/run-manifests.jsonl` 包含一个有效 record、一行损坏 JSON、一个缺少 `issue` 或 `artifacts` 的 record
When observer 页面渲染
Then 有效 manifest record 被显示
And 诊断区指出损坏文件、损坏行与缺失 manifest 字段

### 场景 68：Observer — 尾行截断不丢弃此前完整 run
Given `.state/run-manifests.jsonl` 包含一个完整有效 run record
And 最后一行是没有结尾换行的截断 JSON
When observer 页面渲染
Then 完整 run record 被显示
And 诊断区指出截断尾行已跳过

### 场景 69：Observer — 只读边界无文件修改
Given observer fixture 目录已记录初始文件列表与内容哈希
When observer 启动、页面刷新三次、artifact 区域被查看且 observer 停止
Then watched config files、`.state/*.json`、`.state/run-manifests.jsonl`、artifact directories 与 release directories 没有新增或修改文件

### 场景 70：Observer — 不调用 gh 或 codex
Given fake `gh` 与 fake `codex` commands 被放到 `PATH` 前面
And 这些 fake commands 会记录调用并在被调用时失败
When observer 页面渲染
Then 页面仍可用
And fake invocation logs 为空

### 场景 71：Observer — 配置损坏不是空白白名单
Given `config.local.toml` 存在但无法解析
When observer 页面渲染
Then 诊断区显示配置读取失败
And 页面不把所有 repository 误报为“没有记录”

## 可验证行为
- `pnpm vitest run tests/observer.test.ts` MUST 通过，覆盖 observer 的白名单聚合、状态来源标注、artifact 发布链接 / 图片预览、未发布 artifact 路径、缺 `.state` 文件、坏 state JSON、坏 JSONL、JSONL 尾行截断、manifest 缺字段、损坏 config 诊断、无写入边界、fake `gh` / `codex` 零调用，以及 observer 被强杀后 runner 测试不受影响。
- `pnpm test` MUST 通过，覆盖 local config TOML 解析与 shape 校验、缺失 `config.local.toml` 时默认空白名单、GitHub response intake 的 due 判断、首次 baseline、active/idle 状态转换、active 连续无变化降级、active poll 白名单过滤、active 上限、failed 保留 `updatedAt` 并更新 `failureCount` / `lastFailureReason` / `nextPollAt`、`dead-lettered` 清零失败状态并降级 idle、运行中断 outcome、closed issue 从 active state 移除、driver pool 默认无限制与显式 `maxConcurrent` 限流、runner 心跳扫描派发不等待 job 执行、长跑 job 不阻塞其他 issue 全流程处理、Codex watchdog 超时后 failed 折叠并释放 queued driver pool 名额、in-flight issue 跨心跳防重派发、同心跳批内 issue job 去重、并发 job 完成即独立折叠互不覆盖、state persister 写合并与写失败重试、active 上限策略豁免在跑 issue、扫描结果纯变换应用不覆盖执行侧折叠、并发 role thread / agent context entry merge 写入、并发 runDir 唯一性、对话计数、最新消息选择、agent mention 解析、agent 选择、driver-agnostic conversation interrupt 判断与 monitor、mention-only trigger 解析、普通 `@reflector` / `@ceo` 不触发 Codex、`@secretary` 普通 mention 触发 Codex、secretary speaker 归一化、secretary current repo preScript cwd 传递、stage 枚举、stage marker 宽容匹配、stage marker 单独存在不触发 hook、CEO `no_change` JSON 解析、CEO `append` / `replace` 解析、CEO `append.as=reflector` fail-open、CEO `append.as=secretary` 合法、CEO 修正版后置验证、CEO 异常 / 超时 / 空输出 / 非法 stage fail-open、CEO 超时取消底层 Codex 调用、runner 对所有 Codex agent 响应调用 CEO、CEO 修正版追加 `<!-- agent-moebius:ceo-corrected -->`、CEO append 先发原评论再发独立评论、CEO prompt 包含完整公开 issue context 且不包含 `lastReflectorHook`、speaker timeline、full/resume prompt、delta 消息选择、评论格式化、状态读写、agent manifest 解析、agent context 状态读写、dev workspace pre script stale worktree 自动重建与失败 fallback、dev workspace git 失败 stderr 摘要、dev workspace 本地分支名与 repo cache 串行化、codex jsonl 最终消息解析、thread id 解析、cached token 解析、Codex AbortSignal 中断与忽略温和信号时的强杀兜底、issue media 纯提取 / prompt manifest、SVG issue 输入过滤、media asset 下载校验 / 输出 artifact 发现与 Markdown、Codex `--image` 参数构造、runner 媒体准备失败与 artifact 发布失败路径、CEO append 中的有效 mention 留给下一轮 active poll、`buildAddIssueReactionArgs` 构造安全 GitHub reaction 参数、runner 在真实 Codex driver 路径添加 `eyes` reaction 且在非 Codex 执行路径不添加 reaction、reaction 添加失败时仍继续调用 Codex、`gh` 子进程挂起 timeout、`classifyGhError` 瞬时/确定性/未知三态分类、`withRetry` 重试瞬时错误 / 确定性 bail / 耗尽上抛 / signal 取消、死信发布成功 / 失败 / 故障恢复不误发死信、持续 GitHub fetch 故障达到预算后死信、以及收尾中断检查抛错时 fail-open 照常发布。
- `pnpm typecheck` MUST 通过，确保 TypeScript 严格模式下无类型错误。
- 启动真实 runner 前，运行环境 MUST 满足本机 `codex` CLI 在 `PATH` 中且已完成 `gh auth login`。
- `pnpm start` 会真实扫描白名单 repositories；首次 repository scan 默认只建立 baseline，后续最新消息包含有效 trigger 时会调用 codex 并可能发表评论；执行前应确认这是期望的外部副作用。
