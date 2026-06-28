# 模块地图

当前仓库已提供 TypeScript 运行时代码；`agents/` 仍只作为 Markdown 素材模块记录，不承担运行时状态。

### agents
- 职责边界：存放 agent/用户画像类 Markdown 素材；不负责 GitHub 轮询、状态记录或本地脚本执行。
- 入口：`agents/product-manager.md`、`agents/hermes-user.md`
- 上游：`src/runner.ts` 扫描 `agents/*.md`；最新 issue body/comment 中的 `@<name>` 命中 `agents/<name>.md` 时读取对应 Markdown 作为 system/persona 素材。
- 下游：无运行时依赖。
- 禁止依赖：MUST NOT 依赖运行时状态文件、GitHub token 或本地脚本输出。

### github-issue-runner
- 职责边界：常驻运行，轮询 `tranfu-labs/agent-moebius#3`，把 issue body + comments 归一化为带 speaker 的共享时间线；当最新归一化消息艾特了 `agents/*.md` 中存在的 agent 时，进入该 role 独立 Codex thread 并回评 GitHub issue。
- 入口：`pnpm start` → `src/runner.ts`
- 上游：进程启动命令、本机 `gh auth login`、本机 `codex` CLI。
- 下游：`src/github.ts`、`src/conversation.ts`、`src/codex.ts`、`src/state.ts`、`agents/*.md`。
- 禁止依赖：MUST NOT 依赖 `agents/` 作为运行状态；MUST NOT 直接拼接 issue 内容为 shell 命令；MUST NOT 在 codex 失败时发评论。

### conversation-protocol
- 职责边界：纯业务数据操作，负责共享时间线归一化、speaker 判定、agent mention 选择、full/resume prompt 构造、delta 消息选择、agent 评论格式化、role thread 状态更新计算。不负责 GitHub、Codex CLI 或文件系统。
- 入口：`src/conversation.ts`
- 上游：`github-issue-runner`
- 下游：无真实外部操作。
- 禁止依赖：MUST NOT 调用 `gh` / `codex` / 文件系统；MUST NOT 把 issue 内容拼成 shell 命令。

### local-script-executor
- 职责边界：以受控方式调用本机 `codex`，支持首次 `codex exec` 与后续 `codex exec resume <threadId>`；把 prompt 作为 argv 传入；落盘 stdout/stderr 并提取最终 assistant 文本、`thread.started.thread_id`、`turn.completed.usage.cached_input_tokens`。不负责轮询 GitHub、speaker 归一化或判断 issue 是否已处理。
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

### github-client
- 职责边界：通过 `gh` CLI 读取 issue body/comments，并通过 stdin 发布评论；不负责对话触发规则。
- 入口：`src/github.ts`
- 上游：`github-issue-runner`
- 下游：本机 `gh` CLI。
- 禁止依赖：MUST NOT 在命令参数中拼接 shell 字符串；评论正文 MUST 通过 `--body-file -` 从 stdin 传入。
