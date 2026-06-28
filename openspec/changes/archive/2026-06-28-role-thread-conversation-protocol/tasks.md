# 任务：role-thread-conversation-protocol

- [x] 确认 `<role>:\n${LAST_RESPONSE}` 作为 agent 写回评论的可见模板。
- [x] 确认增加隐藏 metadata `<!-- agent-moebius:role=<role> -->`，用于区分 runner 生成评论与用户伪造的 role 前缀。
- [x] 确认 role thread 状态保存到 `.state/role-threads.json`，状态至少包含 issue 标识、role、threadId、lastSeenIndex。
- [x] 确认首次 full prompt 与后续 resume delta prompt 的文本格式。
- [x] 确认旧评论兼容策略：带 metadata 优先；无 metadata 但以 `<known-role>:` 开头按 legacy agent comment；其他归类为 `user`。
- [x] 确认 JSONL 解析扩展：保存 `thread.started.thread_id`，记录 `cached_input_tokens`，继续提取最终 `agent_message.text`。
- [x] 确认 resume 失败后的回退策略：新建 full prompt thread 并更新 role 映射。
- [x] 完成开发方案确认。
- [x] 实现业务协议层纯函数：timeline 归一化、speaker 判定、prompt 构造、评论格式化、状态更新计算。
- [x] 实现状态适配层：读取/写入 `.state/role-threads.json`，并兼容文件不存在或损坏时的安全失败。
- [x] 扩展 Codex 适配层：支持首次 run 与 resume run，去掉首次执行的 `--ephemeral`，解析 thread id 与 cached input tokens。
- [x] 调整 runner 编排：使用业务协议层生成执行计划，Codex 与 GitHub 成功后再提交状态。
- [x] 补充单元测试：业务协议层、状态读写、JSONL 解析、resume 回退计划。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm typecheck`。
