# github-issue-runner spec delta

## 新增
- MUST 把 GitHub issue body 与 comments 视作一条共享时间线，并在业务处理时把每条消息归一化为带 speaker 的消息。
- MUST 把用户发出的 issue body/comment 视作 `user` speaker，除非后续有可信机器标记证明其为 runner 生成的 agent comment。
- MUST 在 runner 写回 agent 评论时使用可见模板 `<role>:\n${LAST_RESPONSE}`，其中 `${LAST_RESPONSE}` 是 Codex 本轮最终 assistant 文本。
- MUST 在 runner 写回 agent 评论时追加隐藏 metadata `<!-- agent-moebius:role=<role> -->`，用于机器识别 runner 生成的 agent 评论。
- MUST 优先使用隐藏 metadata 识别 agent speaker；没有 metadata 但以 `<known-role>:` 开头的历史评论 SHOULD 按 legacy agent comment 兼容；其他 issue body/comment MUST 归类为 `user`。
- MUST 允许同一个 issue 中多个 role 参与对话，并为每个 role 维护独立的 Codex thread。
- MUST 把 role thread 状态保存在本地忽略目录 `.state/role-threads.json`，状态至少包含 issue 标识、role、threadId、lastSeenIndex。
- MUST 在首次触发某个 role 时使用该 role persona 与当前共享时间线构造 full prompt，并从 Codex JSONL 的 `thread.started.thread_id` 记录该 role 的 thread id。
- MUST NOT 使用 `--ephemeral` 执行首次 Codex run，因为 role thread 需要可 resume 的 Codex session。
- MUST 在再次触发同一 role 时使用 `codex exec resume <thread_id>`，并只把该 role 上次处理后新增、且 speaker 不是该 role 自己的消息合并成 delta prompt。
- MUST 在 3 个及以上 agent 参与同一 issue 时，保持其他 role 与用户的新增消息按共享时间线原顺序进入当前 role 的 delta prompt。
- MUST 继续从 Codex JSONL 中提取最终 `agent_message.text` 作为 `${LAST_RESPONSE}`。
- SHOULD 记录 Codex JSONL 中的 `turn.completed.usage.cached_input_tokens`，用于观察 Codex resume 与模型侧 prompt caching 的收益。
- MUST 在 resume 失败或 thread id 不可用时允许回退到 full prompt 新建 Codex thread，并在 GitHub 评论成功后更新该 role 的 thread 映射。
- MUST 仅在 Codex 成功且 GitHub 评论成功后更新 role thread 状态；失败时 MUST 保持旧状态，允许下一轮重试。
- MUST 让 prompt 构造、speaker 归一化、触发判定、delta 消息选择、评论格式化与状态更新计算保持为可单元测试的业务数据操作，不依赖 GitHub、Codex CLI 或文件系统。

## 修改
- prompt 组织方式从原始 Markdown 全量拼接，修改为基于 speaker 归一化后的共享时间线组织。
- 单 issue 内的 agent 协作方式从“最新消息选中一个 agent 后全量重放所有 body/comments”，修改为“最新消息选中当前 role 后进入该 role 独立 thread，并输入它尚未看过的外部新增消息”。
- `count = 1 + comments.length` 仍可用于日志与运行目录命名，但不应作为 role thread resume 的唯一上下文依据。
- 运行时代码边界修改为“业务协议层纯函数 + GitHub/Codex/state 适配层 + runner 编排层”，避免业务数据操作与真实外部操作混在一起。

## 删除
- MUST 把对话历史按 `\n\n` 顺序拼接为 prompt：`<selected-agent-md>\n\n<issue.body>\n\n<comment[0].body>\n\n<comment[1].body>...`。
- MUST NOT 在对话型 prompt 拼接里加入角色信息。新的协议要求 prompt 中保留 speaker 信息，以便多 role 协作时明确谁在说话。
