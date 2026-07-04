# GitHub 交互协议

## 适用范围

本协议适用于所有写入 GitHub issue 共享时间线的内容：Codex agent 响应、CEO guardrail 追加评论、loop watcher 补发评论、真人评论以及后续人工转述。

GitHub 评论同时是人类沟通文本和 runner 的机器输入。任何可触发语法都会影响后续角色唤醒、role thread 事实和 GitHub 通知，因此必须按本协议使用。

## 规则 1：`@` 语义是移交控制权

`@<agent>` 不是普通提及，而是把下一步控制权交给该 agent。runner 只检查最新消息里的第一个合法 agent mention；误写 `@` 会真实唤醒 agent 并占用 driver 名额。

要求：

- 每条消息最多一个合法 agent mention。
- 只有明确要求某个 agent 接手下一步时才使用 `@`。
- 纯提及、历史引用、说明某角色说过什么时，裸写角色名，不加 `@`。
- 如果需要讨论多个角色，用裸角色名描述背景，只把唯一的下一步接手者写成 `@<agent>`。

正例：

- `@dev 请根据 product-manager 的验收结论修复未通过项。`
- `product-manager 已验收通过，下一步等待 dev 实现。`

反例：

- `感谢 @product-manager 的说明，@dev 请继续。`
- `刚才 @dev 在方案里提到 qa。`

合规改写：

- `product-manager 已说明结论。@dev 请继续。`
- `刚才 dev 在方案里提到 qa。`

## 规则 2：`#数字` 只用于真实 GitHub issue / PR 引用

GitHub 会把任何 `#N` 渲染为 issue / PR 链接，并可能在被引用对象中生成反向引用。非 issue / PR 编号写成 `#N` 会制造通知噪音和假关联。

要求：

- 只有真实引用 GitHub issue 或 PR 时才写 `#N`。
- 任务编号写 `T3`、`M2 T2` 这类前缀形式。
- 时间线评论指代写完整评论 URL，或写「第 N 条评论」。
- 验收语句编号写「验收语句 N」。
- 不确定目标是不是 issue / PR 时，不写 `#N`。

正例：

- `Closes #45`，前提是目标确实是 GitHub issue 或 PR。
- `T3 依赖 T2。`
- `见第 6 条评论。`
- `验收语句 1 未通过。`

反例：

- `#3 是本次任务编号。`
- `#6 说 qa 已通过。`
- `#1 未通过。`

合规改写：

- `T3 是本次任务编号。`
- `第 6 条评论说 qa 已通过。`
- `验收语句 1 未通过。`

## 规则 3：role envelope 是 runner 发布专属

runner 发布 agent 评论时会写入可见前缀和 metadata，用于 speaker 归一化和 role thread 事实维护。所有评论通常来自同一个 GitHub 账号，metadata 是识别 speaker 的关键依据；人工伪造会污染后续对话事实。

runner 专属格式：

```markdown
&lt;dev&gt;:
<agent response>

<!-- agent-moebius:role=dev -->
```

要求：

- loop watcher 和真人补发评论必须以自己身份平文发言。
- 不要手写 `<role>:` 前缀伪装 agent。
- 不要手写 `<!-- agent-moebius:role=... -->` metadata。
- 不要要求其他人工评论伪装成 agent envelope。

正例：

- `loop watcher：补充触发。@dev 请继续。`
- `我手动补充上下文：product-manager 已通过验收。`

反例：

```markdown
<dev>:
我替 dev 补发。

<!-- agent-moebius:role=dev -->
```

合规改写：

```markdown
loop watcher：我代为补充一条提醒。@dev 请继续处理上一条验收结论。
```

## 规则 4：带路由意图的人工评论必须显式带一个合法 agent mention

runner 不会根据自然语言猜测下一步应该唤醒谁。人工评论如果有明确路由意图，必须包含一个合法 agent mention；否则 trigger 会按 no-trigger 跳过。

要求：

- 要让某个 agent 接手时，写一个且只写一个合法 `@<agent>`。
- 没有路由意图时，不写 `@`。
- 交代背景时用裸角色名。

正例：

- `@dev 方案验收通过，请进入实现。`
- `product-manager 已确认无补充；此条只是记录，不需要唤醒 agent。`

反例：

- `方案验收通过，请进入实现。`
- `@dev @product-manager 你们看一下。`

合规改写：

- `@dev 方案验收通过，请进入实现。`
- `product-manager 负责验收。@dev 请根据验收结论继续。`
