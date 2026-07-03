# 提案：2026-07-03-harden-secretary-persona

## 背景
`agents/secretary.md` 在 `2026-07-03-add-secretary-agent` 中新建，走查发现它对「做什么」写得清楚，对「怎么安全地做」和「什么时候不做」留白，共六个缺口：

1. **活仓库 git 纪律缺失**。secretary 的 cwd 是 agent-moebius 当前仓库根目录——很可能就是 runner 进程正在运行的工作树。persona 里只有一句模糊的「检查分支」和「提交并开 PR」：没定义分支策略、脏工作树处理、并发会话互踩。切走分支还会当场换掉运行中系统的 `agents/*.md` 规则文件。dev agent 已在 `2026-07-03-harden-dev-workspace-prescript` 中获得 worktree 隔离 + 串行化，secretary 是唯一直接在活仓库写文件的 agent，却没有任何保护。
2. **缺「不需要改规则」出口**。工作流程默认采访完一定走向修改 `agents/ceo.md`，但采访完全可能得出「CEO 行为正确 / 用户误判」或「这是 runtime bug 而非规则缺失」的结论。
3. **补救机制只有采访项没有执行定义**。采访第 4 件事问「是否补发本次原本应该出现的 CEO 评论」，但全文没说以什么身份、什么方式补发；secretary 不能以 `ceo` 署名发言（`as` 集合是 CEO guardrail 输出通道）。
4. **确认闸门没写死**。secretary 永远输出 `in-progress`，runner 不会像对 dev 的 `plan-written` / `code-verified` 那样强制它停下；persona 又没写在哪等用户确认，容易一路滑到底。
5. **职责防泛化只有正面清单**。`add-secretary-agent` 的 design 权衡明确要求「避免泛化成任意事务秘书」，但 MUST NOT 里没有对应条目。
6. **新规则缺质量守门**。向 `agents/ceo.md` 追加规则时，没有要求检查与既有规则的冲突 / 过度介入叠加，也没显式要求每条规则配 spec 场景。

## 提案
只改文档，不碰运行时代码：

- 重写 `agents/secretary.md`，补齐上述六点：新增「Git 纪律」节（当前分支直接改、不建 / 不切分支、不开 PR；commit+push 前 MUST 经 issue comment 征得用户同意）、采访后三分叉、补救以 secretary 自身署名、方案确认闸门、职责防泛化 MUST NOT、规则质量守门。
- `openspec/specs/github-issue-runner/spec.md` 经 spec-delta 新增对应 MUST 条款（全部 ADDED，不修改既有条目——现有 spec 对 secretary 的 git 行为与分叉出口是沉默的，不冲突）。

## 影响
- 业务域：`github-issue-runner`。
- 修改文件：`agents/secretary.md`、`openspec/specs/github-issue-runner/spec.md`（归档时合并）。
- 对外行为：secretary 不再开 PR，改为在当前分支直接改、经用户 comment 同意后 commit+push；采访可能以「无需改规则」或「转交 runtime 修复」干净结束；补救提醒以 secretary 身份补发。
- 不改变：preScript、trigger、`CEO_APPEND_ROLES`、stage marker 契约、`@ceo` 非普通 agent 的边界。
