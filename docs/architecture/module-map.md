# 模块地图

当前仓库已提供 TypeScript 运行时代码；`agents/` 仍只作为 Markdown 素材模块记录，不承担运行时状态。

### agents
- 职责边界：存放 agent/用户画像类 Markdown 素材；不负责 GitHub 轮询、状态记录或本地脚本执行。
- 入口：`agents/product-manager.md`、`agents/hermes-user.md`
- 上游：`src/runner.ts` 读取 `agents/product-manager.md` 作为对话型 runner 的 system/persona 素材。
- 下游：无运行时依赖。
- 禁止依赖：MUST NOT 依赖运行时状态文件、GitHub token 或本地脚本输出。

### github-issue-runner
- 职责边界：常驻运行，轮询 `tranfu-labs/agent-moebius#1`，把 issue body + comments 视作对话历史；当消息总数为奇数且大于已响应最大 count 时触发本机 codex 并回评 GitHub issue。
- 入口：`pnpm start` → `src/runner.ts`
- 上游：进程启动命令、本机 `gh auth login`、本机 `codex` CLI。
- 下游：`src/github.ts`、`src/conversation.ts`、`src/codex.ts`、`src/state.ts`、`agents/product-manager.md`。
- 禁止依赖：MUST NOT 依赖 `agents/` 作为运行状态；MUST NOT 直接拼接 issue 内容为 shell 命令；MUST NOT 在 codex 失败时发评论或推进去重状态。

### local-script-executor
- 职责边界：以受控方式调用本机 `codex`，把完整 prompt 作为 argv 传入；落盘 stdout/stderr 并提取最终 assistant 文本。不负责轮询 GitHub 或判断 issue 是否已处理。
- 入口：`src/codex.ts`
- 上游：`github-issue-runner`
- 下游：本机 `codex` CLI、`/tmp/agent-moebius-<ISO>-c<count>/stdout.jsonl`、`/tmp/agent-moebius-<ISO>-c<count>/stderr.log`。
- 禁止依赖：MUST NOT 执行来自 issue body / comment 的任意命令；MUST NOT 在日志中输出敏感配置。

### issue-state-store
- 职责边界：记录对话型 runner 已响应的最大消息 count，支撑同一奇数 count 去重和重启恢复；不负责调用 GitHub API 或执行本地脚本。
- 入口：`src/state.ts`
- 上游：`github-issue-runner`
- 下游：`.state/tranfu-labs-agent-moebius-1.json`
- 禁止依赖：MUST NOT 存储 GitHub token；MUST NOT 把本地脚本输出当作唯一去重依据。

### github-client
- 职责边界：通过 `gh` CLI 读取 issue body/comments，并通过 stdin 发布评论；不负责对话触发规则或状态推进。
- 入口：`src/github.ts`
- 上游：`github-issue-runner`
- 下游：本机 `gh` CLI。
- 禁止依赖：MUST NOT 在命令参数中拼接 shell 字符串；评论正文 MUST 通过 `--body-file -` 从 stdin 传入。
