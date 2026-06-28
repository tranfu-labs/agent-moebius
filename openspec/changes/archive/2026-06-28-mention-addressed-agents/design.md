# 设计：mention-addressed-agents

## 方案
在 `src/conversation.ts` 增加纯函数：

- `getLatestMessage(issueBody, commentBodies)`：返回最新 comment body；如果没有 comment，则返回 issue body。
- `parseAgentMentions(text)`：从文本中提取 `@agent-name`，agent 名允许小写字母、数字和短横线，匹配当前 `agents/*.md` 文件名风格。
- `selectMentionedAgent(text, availableAgentNames)`：选择文本中第一个存在于 `availableAgentNames` 的 mention；没有匹配则返回 `null`。

在 `src/runner.ts` 中：

1. 每轮仍读取 issue body 与 comments。
2. 扫描 `AGENTS_DIR` 下的 `.md` 文件，生成 `{ name, path }` 列表。
3. 取最新消息并选择被艾特的 agent。
4. 没有有效 agent mention 时记录 skip 并结束本轮。
5. 有有效 agent mention 时读取对应 Markdown，使用原有 `buildPrompt` 拼接完整对话历史，并调用 `codex`。
6. codex 成功后仍把最终 assistant 文本评论回 issue；失败时仍只记日志、不发评论。

`src/config.ts` 将固定 `AGENT_MD_PATH` 改为 `AGENTS_DIR`，日志字段同步反映 agent 目录。

## 权衡
本 change 明确放弃旧的奇偶 count 轮次判断和本地状态去重触发。这样符合“每次启动时只要最新消息艾特 agent 就启动后续流程”的目标，但也意味着进程重启可能重复回复同一条最新消息。

多 agent mention 暂不做完整编排。如果一条消息包含多个有效 agent mention，本 change 选择文本中最早出现的一个，保证单次 runner 行为确定；多 agent 串行或并行回复作为后续 change。

`agents/` 仍只是角色素材目录，不作为运行时状态目录；runner 只读取 Markdown 内容，不改写 agent 文件。

## 风险
主要风险是重复回复：当最新消息长期包含有效 mention 且进程反复重启时，会重复启动 `codex` 并评论。该行为是本 change 的明确目标，后续若需要可重新引入按 mention/message 标识的去重策略。

另一个风险是 mention 解析误判。当前只支持与文件名一致的 `@lowercase-digits-hyphen` 形式，避免把邮箱或复杂标点解析成 agent。若未来需要下划线、大写或命名空间，再通过新 change 扩展。
