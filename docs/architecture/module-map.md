# 模块地图

当前仓库已提供 TypeScript 运行时代码；`agents/` 仍只作为 Markdown 素材模块记录，不承担运行时状态。

### agents
- 职责边界：存放 agent/用户画像类 Markdown 素材；可通过受信任 frontmatter 声明 runner 预置的 `preScript`，但不负责 GitHub 轮询、状态记录或直接执行本地脚本。
- 入口：`agents/product-manager.md`、`agents/hermes-user.md`、`agents/dev.md`、`agents/reflector.md`
- 上游：`src/runner.ts` 扫描 `agents/*.md`；最新 issue body/comment 中的 `@<name>` 命中 `agents/<name>.md` 时读取对应 Markdown 作为 system/persona 素材。
- 下游：frontmatter 中的 `preScript` 只能指向 `src/agent-prescripts/` 下的受信任脚本；`agents/dev.md` 可声明 runner 可解析的 stage metadata 枚举。
- 禁止依赖：MUST NOT 依赖运行时状态文件、GitHub token 或本地脚本输出。

### triggers
- 职责边界：把最新共享时间线消息解析成触发结果；当前包含普通 mention trigger 与 reflector stage trigger。可返回运行某个 Codex agent、发布确定性 hook 评论或跳过。
- 入口：`src/triggers/index.ts`；`src/triggers/mention-trigger.ts`；`src/triggers/reflector-stage-trigger.ts`
- 上游：`src/runner.ts` 在构造 timeline 与 agent 名单后调用。
- 下游：`src/conversation.ts` 的 timeline / mention 纯函数；hook 评论正文由 trigger 返回给 `runner.ts`，再由 `src/github.ts` 发布。
- 禁止依赖：MUST NOT 调用 `gh` / `codex` / 文件系统；MUST NOT 把 issue 内容拼成 shell 命令；MUST NOT 把 reflector stage 白名单写进 `runner.ts`。

### agent-prescripts
- 职责边界：在 Codex 执行前为特定 agent 准备确定性运行上下文；当前 `dev-workspace` 基于 runner 正在处理的 GitHub issue source 创建 / 复用 issue 独占 worktree，并返回 Codex cwd。
- 入口：`src/agent-manifest.ts` 解析 `agents/*.md` frontmatter；`src/agent-prescripts/index.ts` 通过静态 registry 执行受信任脚本；`src/agent-prescripts/dev-workspace.ts` 实现 `@dev` 工作目录准备。
- 上游：`src/runner.ts` 在选中 agent 且需要调用 Codex 前执行。
- 下游：本地 `git` CLI、`src/agent-context-state.ts`、`src/config.ts` 的 workdir root 与 issue source。
- 禁止依赖：MUST NOT 执行 issue body/comment 中声明的任意脚本路径；MUST NOT 用 shell 拼接外部输入；MUST NOT 把运行状态写入 `agents/`。

### github-response-intake
- 职责边界：纯业务数据操作，负责 GitHub repository / issue source key 生成、闲时 repo 扫描 due 判断、active issue 轮询 due 判断、`updatedAt` 去重、active/idle 状态转换、active 无变化计数与 active issue 上限裁剪。
- 入口：`src/github-response-intake.ts`、`src/issue-source.ts`
- 上游：`src/runner.ts` 在每个 tick 中调用，用于决定哪些 repository / issue source 需要外部读取。
- 下游：无真实外部操作。
- 禁止依赖：MUST NOT 调用 `gh` / `codex` / 文件系统；MUST NOT 读取 agent 文件或构造 prompt；MUST NOT 把 issue 内容拼成 shell 命令。

### github-issue-runner
- 职责边界：常驻运行，按白名单扫描 GitHub repositories，并把 due issue source 交给单 issue 处理流水线；每个 issue 的 body + comments 会归一化为带 speaker 的共享时间线；目标 issue 暂不存在时记录 skip 并等待后续轮询；当 trigger 解析结果要求运行 agent 时，进入该 issue + role 独立 Codex thread 并回评 GitHub issue；当 trigger 解析结果要求发布 hook 评论时，直接通过 GitHub client 评论。
- 入口：`pnpm start` → `src/runner.ts`
- 上游：进程启动命令、本机 `gh auth login`、本机 `codex` CLI。
- 下游：`src/github-response-intake.ts`、`src/github-intake-state.ts`、`src/github.ts`、`src/conversation.ts`、`src/triggers/*`、`src/codex.ts`、`src/state.ts`、`src/agent-manifest.ts`、`src/agent-prescripts/*`、`agents/*.md`。
- 禁止依赖：MUST NOT 依赖 `agents/` 作为运行状态；MUST NOT 直接拼接 issue 内容为 shell 命令；MUST NOT 在 codex 失败时发评论。

### conversation-protocol
- 职责边界：纯业务数据操作，负责共享时间线归一化、speaker 判定、agent mention 选择、full/resume prompt 构造、delta 消息选择、agent 评论格式化、role thread 状态更新计算。不负责 GitHub、Codex CLI 或文件系统。
- 入口：`src/conversation.ts`
- 上游：`github-issue-runner`
- 下游：无真实外部操作。
- 禁止依赖：MUST NOT 调用 `gh` / `codex` / 文件系统；MUST NOT 把 issue 内容拼成 shell 命令。

### local-script-executor
- 职责边界：以受控方式调用本机 `codex`，支持首次 `codex exec` 与后续 `codex exec resume <threadId>`；把 prompt 作为 argv 传入；可接收 pre script 返回的 `cwd` 显式设置 Codex 工作目录；落盘 stdout/stderr 并提取最终 assistant 文本、`thread.started.thread_id`、`turn.completed.usage.cached_input_tokens`。不负责轮询 GitHub、speaker 归一化或判断 issue 是否已处理。
- 入口：`src/codex.ts`
- 上游：`github-issue-runner`
- 下游：本机 `codex` CLI、`/tmp/agent-moebius-<ISO>-c<count>/stdout.jsonl`、`/tmp/agent-moebius-<ISO>-c<count>/stderr.log`。
- 禁止依赖：MUST NOT 执行来自 issue body / comment 的任意命令；MUST NOT 在日志中输出敏感配置。

### role-thread-state
- 职责边界：读取与写入本地 `.state/role-threads.json`，保存 issue + role 到 Codex threadId 与 lastSeenIndex 的映射。不负责 prompt 构造、speaker 判定或 GitHub/Codex 调用。
- 入口：`src/state.ts`
- 上游：`github-issue-runner`
- 下游：本地 `.state/role-threads.json`。
- 禁止依赖：MUST NOT 存放在 `agents/`；MUST NOT 存 GitHub token、prompt 全文或 codex 执行日志。

### agent-context-state
- 职责边界：读取与写入本地 `.state/agent-contexts.json`，保存 issue + role 到 agent pre script 上下文的映射；当前用于记录 `@dev` 的 issue 独占 worktree。
- 入口：`src/agent-context-state.ts`
- 上游：`agent-prescripts`
- 下游：本地 `.state/agent-contexts.json`。
- 禁止依赖：MUST NOT 存放在 `agents/`；MUST NOT 存 GitHub token、prompt 全文或 codex 执行日志。

### github-intake-state
- 职责边界：读取与写入本地 `.state/github-response-intake.json`，保存 repository 闲时扫描时间与 per-issue active/idle 调度状态。不负责 GitHub CLI、trigger 判定或 active/idle 业务规则。
- 入口：`src/github-intake-state.ts`
- 上游：`github-issue-runner`
- 下游：本地 `.state/github-response-intake.json`。
- 禁止依赖：MUST NOT 存放在 `agents/`；MUST NOT 存 GitHub token、prompt 全文、comment 正文或 codex 执行日志。

### github-client
- 职责边界：通过 `gh` CLI 拉取 repository open issue summaries、读取指定 issue body/comments/updatedAt，并通过 stdin 向指定 issue 发布评论；不负责对话触发规则或 active/idle 调度规则。
- 入口：`src/github.ts`
- 上游：`github-issue-runner`
- 下游：本机 `gh` CLI。
- 禁止依赖：MUST NOT 在命令参数中拼接 shell 字符串；评论正文 MUST 通过 `--body-file -` 从 stdin 传入。
