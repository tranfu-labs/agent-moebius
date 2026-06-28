# github-issue-runner spec delta

## 修改
- MUST 支持通过 `agents/*.md` 文件名寻址 agent；`agents/<agent-name>.md` 对应 issue 消息中的 `@<agent-name>`。
- MUST 每轮只检查最新一条可见消息作为触发源：若存在 comments，最新一条 comment body 为触发源；否则 issue body 为触发源。
- MUST 仅当触发源包含至少一个已存在 agent mention 时启动本地 `codex`。
- MUST 使用被选中的 agent Markdown 作为 prompt 前缀，并保持后续 issue body 与 comments 的纯文本拼接顺序不变。
- MUST 在触发源没有有效 agent mention 时跳过，不调用 `codex`，不发表评论。
- MUST 在同一条消息包含多个有效 agent mention 时选择文本中最早出现的一个；多 agent 协作回复留作后续能力。
- MUST 允许进程重启后再次处理仍位于最新消息中的有效 agent mention；本触发规则不依赖本地最大已响应 count 去重。

## 删除
- MUST 仅在 `count` 为奇数且大于已响应的最大 count 时触发一次本地脚本；同一个奇数 count 在后续轮询中不能重复触发。
- MUST 把已响应的最大 count 持久化到本地状态文件，进程重启后不重复响应同一 count。
