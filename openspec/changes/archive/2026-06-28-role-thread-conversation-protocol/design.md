# 设计：role-thread-conversation-protocol

## 方案
本 change 同时定义业务级协议与开发结构。核心原则是：业务数据操作与真实操作层隔离。可测试的 role thread 协议逻辑集中在纯函数模块中；GitHub、Codex CLI、状态文件读写只作为适配层存在；runner 只负责事务式编排。

### 分层结构
实现分三层：

```text
业务协议层
  src/conversation.ts
  - 归一化 issue body/comments 为 timeline
  - 判定 speaker
  - 选择最新消息中被艾特的 role
  - 构造首次 full prompt 与后续 resume delta prompt
  - 格式化 agent 写回评论
  - 计算成功后的 role thread 状态更新

真实操作适配层
  src/github.ts
  - 通过 gh CLI 读取 issue 与发表评论

  src/codex.ts
  - 通过 codex CLI 执行首次 run 或 resume run
  - 解析 stdout JSONL 中的 final assistant、thread_id、cached_input_tokens

  src/state.ts
  - 从本地状态文件读取/写入 issue + role 的 thread_id 与 lastSeenIndex

编排层
  src/runner.ts
  - 拉取 issue、读取 agents、读取状态
  - 调业务协议层得到本轮执行计划
  - 调 Codex/GitHub/state 适配层
  - 仅在 Codex 成功且 GitHub 评论成功后提交状态
```

runner 不直接拼 prompt、不直接判断 speaker、不直接计算游标。这样单元测试主要覆盖业务协议层与 JSONL 解析，真实外部副作用保持薄适配。

### 共享时间线
GitHub issue body 与 comments 共同组成一条 append-only 的共享时间线。业务层读取时不应把它们视作无身份的 Markdown 块，而应归一化为带 speaker 的消息：

```text
#0 <user>: 初始需求
#1 <user>: @product-manager 请先判断
#2 <product-manager>: PM 的回复
#3 <user>: @hermes-user 请补充用户视角
#4 <hermes-user>: 用户画像 agent 的回复
```

其中 `<role>:` 是写回 GitHub 的可见标记。它的主要价值是让其他 agent 在后续 resume 输入里知道“这段话是谁说的”。

### 写回评论模板
runner 从 Codex JSONL 中提取最终 assistant 文本后，写回 GitHub 的 comment 使用：

```md
<role>:
${LAST_RESPONSE}
```

这里的 `${LAST_RESPONSE}` 指 Codex 输出结果。它不是上一次 prompt，也不是完整对话历史。

写回评论同时追加隐藏 metadata，用于机器识别 runner 生成的 agent 评论：

```md
<role>:
${LAST_RESPONSE}

<!-- agent-moebius:role=<role> -->
```

业务上必须保证可见 `<role>:` 前缀存在；隐藏 metadata 只作为可信度增强。读取历史 comment 时，带 metadata 且 role 存在于本地 agents 的评论归类为该 role；没有 metadata 但以 `<known-role>:` 起始的评论按 legacy agent comment 兼容；其他评论都归为 `user`。

### 每个 role 一条 Codex thread
同一个 issue 中，多个 agent 不共享同一条 Codex session。每个 role 独立维护：

```text
tranfu-labs/agent-moebius#3 + product-manager -> PM_THREAD_ID, lastSeenIndex
tranfu-labs/agent-moebius#3 + hermes-user     -> HU_THREAD_ID, lastSeenIndex
```

这样做的语义是：每个 role 都有自己的长期记忆与上下文连续性。`product-manager` 不会把 `hermes-user` 的内部 thread 当作自己的历史；它只通过共享 issue 时间线看到 `hermes-user` 已经公开说过的话。

### 状态保存
状态保存到仓库本地但不入库的 `.state/role-threads.json`。该目录已在 `.gitignore` 中忽略。

状态 shape 以 issue 标识分组，再以 role 分组：

```json
{
  "tranfu-labs/agent-moebius#3": {
    "product-manager": {
      "threadId": "00000000-0000-0000-0000-000000000000",
      "lastSeenIndex": 4
    }
  }
}
```

`lastSeenIndex` 表示该 role 成功完成处理并写回评论后，已看过的共享时间线最后一条消息 index。游标只能在 Codex 成功、GitHub 评论成功之后更新；失败时保持旧状态，下一轮可重试。

### 首次输入与 resume 输入
首次触发某个 role：

```text
输入 = role persona + 当前规范化共享时间线
运行 = codex exec --json <fullPrompt>
记录 = stdout.jsonl 中的 thread.started.thread_id
```

再次触发同一 role：

```text
输入 = 该 role 上次处理后新增、且 speaker != 当前 role 的消息集合
运行 = codex exec resume <thread_id> --json <deltaPrompt>
更新 = lastSeenIndex
```

delta prompt 的语义示例：

```md
以下是共享 issue 时间线中，你上次处理后新增、且不是你自己发出的消息：

<hermes-user>:
我从目标用户视角补充……

<user>:
@product-manager 请基于上面继续判断商业化路径。
```

当前 role 自己过去的回复不重复进入 delta prompt，因为它已经在该 role 的 Codex thread 中。其他 role 和用户的新消息需要进入 delta prompt，因为它们是当前 role 尚未看过的公开上下文。

首次执行不能使用 `--ephemeral`，否则 Codex 不会持久化可 resume 的 session。后续 resume 执行使用 `codex exec resume <thread_id> --json <deltaPrompt>`。模型、fast mode 等配置沿用当前 `CODEX_EXEC_OPTIONS` 的非 ephemeral 配置。

### JSONL 字段在协议中的作用
Codex JSONL 是 role thread 协议的事实来源之一：

- `thread.started.thread_id`：首次运行后保存为该 issue + role 的 Codex thread 句柄。
- `item.completed.item.type = agent_message` 且 `item.text`：提取为 `${LAST_RESPONSE}`，写回 GitHub comment。
- `turn.completed.usage.cached_input_tokens`：记录模型侧缓存命中情况，用于观察 resume 与稳定 prompt 组织是否带来收益。

### resume 失败回退
当状态中存在 `threadId` 但 Codex resume 返回失败，runner 允许回退一次 full prompt：

1. 用当前 role persona 与完整共享时间线重新构造 full prompt。
2. 新建 Codex thread。
3. GitHub 评论成功后，用新 `threadId` 覆盖该 role 状态，并把 `lastSeenIndex` 更新到本轮时间线末尾。

如果回退 full prompt 也失败，runner 只记录失败日志，不发表评论、不更新状态。

### 缓存收益模型
本 change 不引入外部缓存。缓存收益来自两层：

1. Codex session resume：同一个 role 的历史上下文留在它自己的 thread 中，后续只传新增外部消息。
2. 模型侧 prompt caching：首次 full prompt 与后续 resumed context 中的稳定前缀可由模型侧缓存复用，具体收益通过 `cached_input_tokens` 观测。

## 权衡
每个 role 独立 thread 会让状态管理比“每次完整拼接 issue”复杂，需要保存 `thread_id` 与 `lastSeenIndex`。但它换来的是更清晰的对话语义：role 的内部上下文连续，其他 role 的发言通过公开时间线进入。

不选择“所有 role 共用一条 Codex thread”，因为那会让不同 agent 的 persona 和上下文混在一起，削弱角色独立性，也难以解释某个回复到底继承了哪个 agent 的内部历史。

不选择“只给评论加 `<role>:`，但仍每次全量拼接”，因为它只能解决 speaker 可读性，不能充分利用 `codex exec resume`。

状态文件不放在 `agents/` 下，因为 `agents/` 只存 Markdown 角色素材，不能作为运行时状态目录。使用 `.state/` 与现有忽略规则一致。

## 风险
主要风险是 speaker 标记可信度。可见 `<role>:` 前缀对人和模型都友好，但用户也可以手写。本方案追加隐藏 metadata 作为机器可读标记，并对无 metadata 的历史评论保留 legacy 兼容；它提升了可解析性，但不等同于强认证。

第二个风险是 thread 状态丢失。若保存的 `thread_id` 不可用或 resume 失败，应允许回退到 full prompt 新建 thread，并更新映射。

第三个风险是游标错误。若某个 role 的 `lastSeenIndex` 更新过早，可能漏看其他 role 的新增消息；若更新过晚，则可能重复喂入已看过的公开上下文。后续实现必须让游标更新发生在 Codex 成功并评论成功之后。
