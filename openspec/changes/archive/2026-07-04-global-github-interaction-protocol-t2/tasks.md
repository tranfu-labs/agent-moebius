# 任务：global-github-interaction-protocol-t2

## 实现

- [x] 新增 `docs/protocols/github-interaction.md`，覆盖四条协议，并为每条规则提供正例、反例与合规改写。
- [x] 同步所有 `agents/*.md`，加入最小协议引用与遵守要求，不复制协议全文。
- [x] 更新 `agents/ceo.md`，增加 GitHub 交互协议违规的 append-only 纠偏规则，不启用 replace。
- [x] 更新 `src/conversation.ts`，让 mention 解析忽略 fenced code block 与 inline backtick 内的合法 agent mention。
- [x] 更新 `openspec/changes/global-github-interaction-protocol-t2/spec-delta/github-issue-runner/spec.md`，记录协议、persona、CEO 与 mention 解析的新行为。

## 测试

- [x] `tests/conversation.test.ts`：覆盖 inline backtick 内 mention 不解析、fenced code block 内 mention 不解析、代码区域外 mention 仍解析且 index 正确。
- [x] `tests/triggers.test.ts`：覆盖最新消息只有代码区域内 mention 时 no-trigger，代码区域外 mention 仍触发。
- [x] `tests/format-ceo.test.ts`：覆盖 CEO persona 中协议违规纠偏规则存在，并用 fake CEO append 验证违规响应走 append 路径。

## 验证

- [x] 打开 `docs/protocols/github-interaction.md`，确认 `@` 移交语义与 `#数字` 使用规则均有正例、反例和合规改写。
- [x] 跑 `rg -l "github-interaction|交互协议" agents/`，确认所有 persona 文件均命中。
- [x] 跑代码块 / inline code mention 相关单测，确认代码区域内 mention 不触发 dev，代码区域外 mention 仍触发且 index 正确。
- [x] 跑 `pnpm test` 与 `pnpm typecheck`，确认退出码 0。

## 收尾

- [x] 合并 spec-delta 到 `openspec/specs/github-issue-runner/spec.md` 并归档本 change。
- [x] 把每条验收语句的证据追记到 `docs/roadmap/milestone-2-stability-oracle.md` T2 下方，并勾选 T2。
- [x] 更新受影响的 `AGENTS.md` / 模块地图；若确认无新增命令、无依赖边界变化，则记录无需改动。
- [ ] 提交本次变更；有 remote 时按项目流程开 PR。
