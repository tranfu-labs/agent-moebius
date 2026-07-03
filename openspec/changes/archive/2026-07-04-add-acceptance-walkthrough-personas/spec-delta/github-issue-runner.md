# github-issue-runner spec delta

## 新增
- MUST 让 `agents/hermes-user.md` 在被 mention 请求验收方案或代码结果时，按可用「验收语句」逐条走查并输出结构化结论。
- MUST 让 `agents/product-manager.md` 在被 mention 请求验收方案或代码结果时，按可用「验收语句」逐条走查并输出结构化结论。
- MUST 让验收角色的每条验收结论对应一条验收语句，并包含 `通过` 或 `不通过` 与依据。
- MUST 让验收角色在方案阶段基于阅读 dev 方案进行推演验收，在代码阶段基于 dev 提供的测试输出、截图 artifact、文件路径、命令输出等证据验收。
- MUST 让验收角色在全部验收语句通过时声明验收通过，并说明下一步等待谁。
- MUST 让验收角色在任一验收语句不通过时 mention `@dev`，并明确指出未过语句、实际观察与期望差异。
- MUST 让 `agents/hermes-user.md` 与 `agents/product-manager.md` 的验收响应仍以 `<!-- agent-moebius:stage=in-progress -->` 作为最后一行。

## 场景
### 场景：验收角色 — 方案阶段逐条验收并指出失败项
Given CEO guardrail 或用户最新消息 mention `@product-manager`
And 消息要求按 dev `plan-written` 方案末尾的「验收语句」验收方案
And 验收请求包含 3 条验收语句
And dev 方案明显未覆盖其中 1 条验收语句
When product-manager 响应验收请求
Then 响应必须逐条输出 3 行结论
And 每行必须包含 `通过` 或 `不通过` 与依据
And 失败项必须 mention `@dev`
And 失败项必须说明未过语句与期望差异
And 最后一行必须是 `<!-- agent-moebius:stage=in-progress -->`

### 场景：验收角色 — 代码阶段按 dev 证据逐条验收
Given CEO guardrail 或用户最新消息 mention `@hermes-user`
And 消息要求按历史方案中的「验收语句」验收 dev `code-verified` 实现
And dev 响应提供测试输出、文件路径或截图 artifact 作为证据
When hermes-user 响应验收请求
Then 响应必须逐条输出每条验收语句的通过 / 不通过结论
And 每条依据必须引用 dev 提供的证据或指出缺少证据
And 全部通过时必须声明验收通过
And 必须说明下一步等待谁
And 最后一行必须是 `<!-- agent-moebius:stage=in-progress -->`
