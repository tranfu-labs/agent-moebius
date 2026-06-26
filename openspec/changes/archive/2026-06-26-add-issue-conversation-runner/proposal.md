# 提案：add-issue-conversation-runner

## 背景
当前 `github-issue-runner` 域已有「轮询 → 触发本地脚本」的 spec，但仓库里还没有任何 TypeScript 运行时代码，也没有 `package.json` / `tsconfig.json`。需求方希望在 `tranfu-labs/agent-moebius#1` 这条 issue 上把 GitHub 评论流变成一场人机轮流对话：每当 `body + comments` 的消息总数变成奇数，就让本机 `codex` 接力发言一次；本质是对已有 spec 的具体化 + 扩展（增加对话历史拼接、奇偶触发、单一 issue 固定盯）。

## 提案
- 初始化 TS 工程（package.json + tsconfig + tsx 运行 + vitest 测试）。
- 新增 `src/runner.ts` 常驻进程：每 5 分钟轮询 `tranfu-labs/agent-moebius#1`，按消息总数奇偶决定是否调用本机 `codex`。
- 拼接规则：`agents/product-manager.md\n\n{issue.body}\n\n{comment1}\n\n{comment2}...`。
- 调用方式：`spawn('codex', [...固定 args, prompt], {stdio: ['ignore','pipe','pipe']})`，严禁拼 shell。
- 输出落 `/tmp/agent-moebius-<ISO>-c<count>/{stdout.jsonl, stderr.log}`，路径写入日志。
- codex 退出后从 `stdout.jsonl` 解析最终 assistant 文本，用 `gh issue comment ... --body-file -` 发回 issue。
- 状态持久化：`.state/tranfu-labs-agent-moebius-1.json` 记录 `maxRespondedCount`，避免同一奇数 count 重复触发。
- 失败处理：codex 非 0 退出或解析不出最终消息 → 仅日志 + 跳过本轮，不发评论、不推进状态。

## 影响
- **业务域**：扩展 `openspec/specs/github-issue-runner/`，新增「对话型 issue runner」场景。
- **仓库结构**：新增 `src/`、`tests/`、`package.json`、`tsconfig.json`，更新 `.gitignore`（`node_modules/`、`.state/`）。
- **AGENTS.md**：需要在「常用命令」节填上 install / start / test 命令。
- **运行依赖**：本机需安装 `codex` CLI 且在 PATH；本机需已 `gh auth login`。
- **对外行为**：会在 `tranfu-labs/agent-moebius#1` 下产生机器人评论（人类回复后下一轮触发，再回应）。
