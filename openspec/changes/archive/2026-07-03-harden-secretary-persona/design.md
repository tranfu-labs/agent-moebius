# 设计：2026-07-03-harden-secretary-persona

## 方案

### `agents/secretary.md` 六处改动

**① 新增「Git 纪律」节**（替换「检查分支」与「提交并开 PR」两处旧表述）：

- cwd 是正在运行的系统的活仓库：MUST NOT 创建、切换或 reset 分支——切走分支等于当场换掉运行中系统的规则文件；MUST NOT 开 PR。
- 所有改动直接在当前分支完成；commit + push 前 MUST 在 issue thread 里以 comment 征得用户同意，未获同意 MUST NOT commit/push。
- 开工前 `git status`：发现与本次无关的未提交改动 → 停下向用户报告，不擅自处理（stash/checkout/commit 别人的改动都不行）。
- commit 只 `git add` 自己改过的具体路径，MUST NOT `git add -A` / `git add .`。
- push 被拒（远端领先）→ `git pull --rebase` 后重试一次，再失败停下报告。

**② 采访后三分叉**（在「信息充分后」之前插入）：

- CEO 行为其实正确 / 用户误判 → 解释原因，干净结束，不造 change。
- 是 runtime 缺陷而非规则缺失 → 说明诊断，建议用户转 `@dev`，MUST NOT 用 prompt 规则去补 runtime bug。
- 确认是规则缺失 → 进入方案流程。

**③ 补救机制写明**：需要补发时，secretary 在 issue thread 里以自己的身份补上那条提醒正文，注明「代 CEO 补发」；MUST NOT 伪装 `ceo` 署名。

**④ 确认闸门写成硬规则**：聊天框方案发出后 MUST 停下等用户确认；未确认 MUST NOT 落盘 `openspec/changes/`、MUST NOT 修改 `agents/ceo.md`。并在输出契约节说明：正因 secretary 永远 `in-progress`、runner 不会强制介入，闸门必须靠 persona 自身遵守。

**⑤ 职责防泛化**：MUST NOT 新增条目——不承接与 CEO guardrail 规则无关的开发 / 事务请求，收到时指引用户找 `@dev` 等对应 agent 并结束。

**⑥ 规则质量守门**：向 `agents/ceo.md` 追加规则前，MUST 检查与既有规则是否冲突、或叠加导致 CEO 过度介入；每条新规则在 spec-delta 里配一个 Given/When/Then 场景。

### spec-delta
`github-issue-runner` spec 的 secretary 条目区新增 ①-⑥ 对应 MUST 条款，全部 ADDED；既有 4 条 secretary MUST 不动。

## 权衡

- **persona 层 git 纪律，而不是专属 worktree prescript**：用户选轻方案。worktree 隔离能硬性防住违规，但要动运行时代码与 registry；persona 纪律零运行时改动即可落地。若日后 secretary 实际违反纪律，再升级为 worktree prescript（记为后续可选项）。
- **不建分支 + 不开 PR，push 前经 comment 同意**：不建分支是为了不动运行中系统的工作树状态；代价是改动不经 PR review 进 main，由「push 前 comment 同意」补一道人工闸。这是 secretary 的显式约定，写进 persona 与 spec，避免与仓库通用「开 PR」习惯混淆。
- **补救以 secretary 身份**：`as` 集合是 CEO guardrail 发布通道的署名白名单，不是 secretary 的发言通道；secretary 冒充 `ceo` 署名会破坏评论可审计性。注明「代 CEO 补发」保留语义。
- **三分叉放在采访之后、方案之前**：判断「要不要改」必须先于「怎么改」，避免为误判强造 change。

## 风险

- persona 纪律靠模型遵守，不是硬约束；secretary 违反时活仓库可能进入脏状态。缓解：条款写成 MUST/MUST NOT 并进 spec；升级路径是 worktree prescript。
- persona 与 spec 双处表述，后续只改一处会失真。缓解：本 change 归档时合并 spec-delta，后续改动按 OpenSpec 流程同步。
- 回滚方式：还原 `agents/secretary.md`，从 spec 移除本次新增条款。

## 验证计划

### 单元测试
无。纯 persona / spec 文档改动，不含可测逻辑（豁免理由：无纯函数、无数据转换、无跨文件契约变化；现有测试只断言 runtime 层 trigger / prescript / `CEO_APPEND_ROLES`，均不受影响）。

### AI / 命令验证
- 人工走查改后 `agents/secretary.md`：六点齐全；git 纪律与「按 OpenSpec 流程推进」不自相矛盾（OpenSpec 流程里的「提交」按本 persona 的 git 纪律执行）；仍保留原有采访四件事、修改边界与 stage marker 契约。
- `pnpm test` 与 `pnpm typecheck` 零回归。
