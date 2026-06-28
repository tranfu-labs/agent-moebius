# 提案：role-thread-conversation-protocol

## 背景
当前对话型 runner 把 issue body 与 comments 作为原始 Markdown 文本顺序拼接给被艾特的 agent。这个形态在单 agent 场景下足够直接，但进入多个 agent 轮流参与同一个 issue 时，会出现两个问题：

1. comment list 缺少稳定的 speaker 标记。后续 agent 只能看到一段段 Markdown，不知道哪些内容来自用户、哪些内容来自其他 agent。
2. 每次都把完整 issue 历史重新传给 `codex exec`，没有利用 Codex 非交互 session 的 `resume` 能力，也无法把不同 agent 的上下文隔离成各自可延续的 thread。

目标不是接入外部缓存，而是把 GitHub issue comment list 组织成可路由的共享对话流：每个 agent 拥有自己的 Codex thread；GitHub 作为所有 role 共同可见的事实时间线；当某个 role 再次被艾特时，只把它上次处理后新增的外部消息作为 `resume` 输入。

## 提案
引入 role 标记与 role thread 协议：

- runner 写回 GitHub 的 agent 评论 MUST 使用可见模板：

  ```md
  <role>:
  ${LAST_RESPONSE}
  ```

  其中 `${LAST_RESPONSE}` 是 Codex 本轮最终 assistant 文本，不是传给 Codex 的 prompt。

- GitHub issue body/comments 被视作共享时间线。每条消息在业务上都应归一化为：消息序号、speaker、正文。
- 用户消息的 speaker 为 `user`；runner 产生的 agent 评论通过 `<role>:` 前缀标识 speaker。
- 每个 role 独立绑定一条 Codex thread。例如 `product-manager` 与 `hermes-user` 在同一个 issue 内分别对应不同的 `thread_id`。
- 第一次触发某个 role 时，runner 用该 role persona 与当前共享时间线构造完整 prompt，并从 Codex JSONL 的 `thread.started.thread_id` 记录该 role 的 thread。
- 再次触发同一 role 时，runner 使用 `codex exec resume <thread_id>`，输入只包含该 role 上次处理后新增、且不是该 role 自己发出的消息。
- 当 3 个及以上 agent 参与同一 issue 时，当前 role 的 resume 输入应把其他 role 与用户的新增消息按原时间顺序合并成一条新的 prompt，让当前 role 明确知道谁说了什么。
- Codex JSONL 中的 `item.completed` / `agent_message.text` 仍作为待写回 GitHub 的最终评论来源；`turn.completed.usage.cached_input_tokens` 作为模型侧缓存收益的观测指标。

## 影响
- `github-issue-runner` 的 prompt 组织方式从“原始 Markdown 全量拼接”升级为“带 speaker 的共享时间线 + 每 role 独立 thread + resume 增量输入”。
- 现有 `buildPrompt(agentMarkdown, issueBody, commentBodies)` 行为将不再是长期目标；后续实现应以业务归一化后的 transcript 为输入。
- `codex` 调用需要从 JSONL 中解析并保存 `thread.started.thread_id`，并支持首次 `exec` 与后续 `exec resume` 两种运行形态。
- 需要新增 per issue/per role 的最小运行状态，用于保存 role 到 thread 的映射与各 role 已处理到的时间线位置。该状态不是外接缓存，而是 Codex session 续接所需的句柄与游标。
- 旧的无 `<role>:` 前缀评论需要兼容处理，避免历史 issue 在迁移后无法读取。
