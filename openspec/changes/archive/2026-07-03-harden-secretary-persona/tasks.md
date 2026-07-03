# 任务：2026-07-03-harden-secretary-persona

- [x] 重写 `agents/secretary.md`：新增「Git 纪律」节（当前分支直接改、不建 / 不切分支、不开 PR、commit+push 前经 comment 同意、脏工作树停下、只 add 自己的路径）
- [x] `agents/secretary.md`：采访后三分叉（CEO 正确 → 结束；runtime 缺陷 → 转交；规则缺失 → 继续）
- [x] `agents/secretary.md`：补救机制写明以 secretary 自身署名、注明代 CEO 补发，MUST NOT 伪装 `ceo`
- [x] `agents/secretary.md`：方案确认闸门写成 MUST（未确认不落盘、不改 `agents/ceo.md`）
- [x] `agents/secretary.md`：MUST NOT 新增职责防泛化条目（无关请求指引对应 agent）
- [x] `agents/secretary.md`：规则质量守门（冲突 / 过度介入检查 + 每条新规则配 Given/When/Then 场景）
- [x] `spec-delta/github-issue-runner.md`：新增上述六组 MUST 条款
- [x] 人工走查改后 persona：六点齐全、无自相矛盾、原有契约保留
- [x] `pnpm test` + `pnpm typecheck` 全绿
