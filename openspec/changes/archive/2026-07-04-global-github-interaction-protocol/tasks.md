# 任务：global-github-interaction-protocol

- [x] 新增 `docs/protocols/github-interaction.md`，覆盖 `@` 控制权移交、`#数字` 真实 issue / PR 引用、runner 专属 role envelope、人工路由必须带一个合法 mention，并为每条规则写正例 / 反例 / 合规改写。
- [x] 同步所有 `agents/*.md`：添加最小协议引用；`agents/ceo.md` 额外新增 append-only 协议违规纠偏场景。
- [x] 修改 `src/conversation.ts`：mention 解析忽略 fenced code block 与 inline backtick 内的 agent mention，保持普通文本行为和 index 契约不变。
- [x] 补 `tests/conversation.test.ts`：覆盖 inline code、fenced code block、未闭合 fenced code block、代码块后普通 mention 的解析结果。
- [x] 补 `tests/triggers.test.ts`：最新消息仅含代码块或 inline code 内 `@dev` 时不触发 dev。
- [x] 补 CEO 相关测试：persona 包含协议纠偏规则；构造含裸 `@dev` 纯提及与 `#3` 任务编号的 agent 响应跑 CEO 校正路径时得到 append 纠偏。
- [x] 跑 `pnpm test`、`pnpm typecheck` 和 `git diff --check`，全部退出码为 0。
- [x] 实现验证通过后归档 change，合并 spec-delta 到 `openspec/specs/github-issue-runner/spec.md`，并把 T2 验收证据追记到 `docs/roadmap/milestone-2-stability-oracle.md` 后勾选 T2。
