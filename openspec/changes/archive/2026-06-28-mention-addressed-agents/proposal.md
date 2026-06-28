# 提案：mention-addressed-agents

## 背景
当前对话型 runner 固定读取 `agents/product-manager.md`，并通过消息总数奇偶与本地状态判断是否触发。这让 issue 上的任何符合奇数轮次的内容都会触发产品经理回复，无法表达“只有明确艾特某个 agent 时才让它接话”。

项目已经把 `agents/` 定义为 Markdown 角色素材目录，适合用文件名作为可寻址 agent 名称。

## 提案
把触发规则改为：每次轮询只检查最新一条可见消息。如果最新 comment 存在则检查最新 comment，否则检查 issue body。只有最新消息包含 `@<agent-name>`，且 `agents/<agent-name>.md` 存在时，runner 才读取该 Markdown 并以对应 agent 身份启动 `codex`。

本 change 支持 `agents/*.md` 中所有文件名对应的 agent，例如 `agents/product-manager.md` 对应 `@product-manager`，`agents/hermes-user.md` 对应 `@hermes-user`。prompt 拼接仍保持现有顺序和纯文本形态：`<agent-md>\n\n<issue.body>\n\n<comment[0].body>...`。

多 agent mention 先不作为完整协作能力实现；本 change 只保证行为确定，后续可扩展为多 agent 调度。

## 影响
- `github-issue-runner` 的触发条件从“新奇数 count 且未响应”变为“最新消息艾特了已存在 agent”。
- runner 重启后如果最新消息仍包含有效 agent mention，会再次触发回复；本 change 不再依赖本地去重状态阻止这种重启触发。
- `src/runner.ts` 不再固定读取 `agents/product-manager.md`，改为扫描 `agents/` 并选择被艾特的 agent。
- `src/conversation.ts` 增加最新消息选择、agent mention 解析与 agent 选择逻辑。
- `issue-state-store` 相关代码可保留但不再参与本次触发判断。
