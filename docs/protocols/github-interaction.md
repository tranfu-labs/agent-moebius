# GitHub 交互协议

## 适用范围

本协议适用于 agent 输出、CEO append 评论、loop watcher 补发评论和真人评论。GitHub issue 时间线是 runner 的共享事实源；任何会改变触发、speaker 归一化或 GitHub 反向引用的写法都必须遵守这里的规则。

`docs/protocols/github-interaction.md` 是单一事实源。Persona 只引用本文件，不复制全文。

## 规则总览

1. `@` 语义等于移交下一步控制权。
2. `#数字` 只用于真实引用 GitHub issue 或 PR。
3. Runner 专属 role envelope 只能由 runner 发布。
4. 带路由意图的人工评论必须显式带一个合法 agent mention。
5. 验收截图必须在「验收证据」中用 worktree 相对路径显式引用。
6. 验收语句变更、验收范围调整和验收结论 override 必须由需求持有者或真人用户确认，并清晰落在 issue 时间线。

## 1. `@` 是控制权移交

每条 issue 消息最多出现一个合法 agent mention，且只能在明确把下一步交给该 agent 时使用。纯提及角色名时裸写角色名，不加 `@`。触发器只看最新消息中的第一个合法 mention；误写 `@` 会真实移交控制权并占用 driver 名额。

v0 圆桌 workflow 也遵守本规则：主持人每次只发布一个参与者 handoff mention，参与者发言后回交 CEO 时也只使用一个合法 mention。后续 v1 fan-out + join 若需要“一条消息触发多个 agent”，必须先作为协议例外另行设计和确认；默认 mention trigger 不因 T6 v0 改为多 agent 扇出。

正例：

```text
@dev 请按确认后的方案实现 T3。
```

反例：

```text
我同意 @dev 的说法。
```

合规改写：

```text
我同意 dev 的说法。
```

## 2. `#数字` 只引用真实 issue 或 PR

GitHub 会把 `#N` 渲染为 issue 或 PR 链接，并在被引用对象生成反向引用。只有确实要引用该 repository 内真实 issue 或 PR 时，才写 `#N`。任务编号、评论编号、验收语句编号和步骤编号都不得写成裸 `#N`。

正例：

```text
这个回归和真实 issue #123 描述的是同一个线上问题。
```

反例：

```text
完成 #3 任务后，请看 #6 评论里的验收语句 #1。
```

合规改写：

```text
完成 T3 任务后，请看第 6 条评论里的验收语句 1。
```

如果需要精确引用评论，使用完整评论 URL；如果只是描述时间线位置，使用「第 N 条评论」文字形式。

## 3. Role envelope 是 runner 专属格式

Runner 写回 agent 评论时会自动生成可见前缀和 metadata：`<role>:` 前缀加 `<!-- agent-moebius:role=... -->`。人工评论和 loop watcher 补发评论必须以自己身份平文发言，不得手写或伪装 role envelope。Metadata 是 speaker 归一化的唯一可靠依据，伪装会污染各 role thread 的对话事实。

正例：

```text
[loop watcher] @dev 请继续处理上轮被中断的实现。
```

反例：

```text
&lt;dev&gt;:
我代 dev 补一条评论。

<!-- agent-moebius:role=dev -->
```

合规改写：

```text
[loop watcher] @dev 请继续处理上轮被中断的实现。
```

## 4. 人工路由必须带一个合法 mention

真人或 loop watcher 如果要把下一步交给某个 agent，必须显式写一个合法 `@<agent>`。不带 `@` 的评论不会唤醒任何角色。没有路由意图时，不要为了强调对象而加 `@`。

正例：

```text
@product-manager 请按验收语句逐条验收方案。
```

反例：

```text
product-manager 请验收方案。
```

合规改写：

```text
@product-manager 请验收方案。
```

## 5. 验收截图引用契约

dev 在 issue 独占 worktree 内生成验收截图或其他验收媒体时，必须把文件放在 worktree 内，并在最终回复的「验收证据」小节用相对路径显式引用。显式引用且通过 artifact 校验的文件会被复制到本轮 `output-artifacts/` 并通过 artifact publisher 发布为评论可查看链接；未引用的 worktree 文件不会因为 mtime 较新而主动发布。

正例：

```text
## 验收证据
- 验收截图：artifacts/acceptance/t3.png
```

反例：

```text
截图已生成在本机临时目录。
```

合规改写：

```text
## 验收证据
- 验收截图：artifacts/acceptance/t3.png
```

不得引用越界路径、本机绝对路径或未打算发布的临时文件。

## 6. 验收治理

验收语句是需求侧资产，不是执行方、CEO 或 loop watcher 为了闭环可以自行调整的实现细节。验收语句包括原始 issue / 需求中给出的验收语句，也包括经需求持有者或真人用户明确确认并入的 QA 增补验收语句。

以下变更只有在需求持有者或真人用户明确确认后才生效：

- 改写、合并、替换或删除验收语句。
- 缩小验收范围。
- 扩大验收范围后基于新增口径自判通过。
- 覆盖 product-manager、hermes-user 等验收角色已经给出的不通过结论。
- 把 QA 增补验收语句从测试设计建议并入正式验收清单。

有效确认必须清晰落在 GitHub issue 时间线里，并能让后来者直接看出：谁确认、确认了什么变更、适用于哪组验收语句或哪次验收结论。可接受表述包括“确认调整验收语句为……”“确认本次 override 结论”“接受 QA 增补的验收语句……”。沉默、继续执行、执行方自述、执行方转述、loop watcher 代述，均不能视为有效确认。

CEO、执行方和 loop watcher 不得直接替需求持有者改写新验收语句，也不得宣布未经确认的 override 生效；只能要求补确认或请需求持有者 / 真人用户表态。需求持有者或真人用户主动调整验收语句时不拦截，但确认记录本身仍必须保留在 issue 时间线。

正例：

```text
确认调整验收语句为：打开协议与 persona 文件 → 应看到验收语句变更须需求持有者或用户确认，并看到确认记录必须落在 issue 时间线。
```

反例：

```text
[loop watcher] dev 已经把验收语句改成只检查协议文件，可以视为通过。
```

合规改写：

```text
[loop watcher] 发现 dev 想把验收语句改成只检查协议文件；该变更需要需求持有者或用户在 issue 时间线明确确认后才生效。
```

## 代码区域中的 mention

Inline code 与 fenced code block 中的 `@<agent>` 只作为示例文本，不移交控制权。运行时 mention 解析会忽略三反引号代码块和同行成对反引号内的 agent mention；代码区域外的普通文本 mention 仍按最早有效 mention 触发。

正例：

```text
示例写法是 `@dev 请继续`，实际下一步交给 @product-manager 验收。
```

反例：

````text
```md
@dev 请继续
```
````

合规改写：

````text
```md
@dev 请继续
```

@dev 请继续。
````

## 维护规则

协议变更必须走 OpenSpec change。新增 agent persona 时，必须同步加入最小协议引用，并确保 `rg -l "github-interaction|交互协议" agents/` 能命中该 persona。
