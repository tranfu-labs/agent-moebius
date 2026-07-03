# 提案：extend-ceo-pr-verification-and-authorization

## 背景

CEO guardrail 当前是一次无状态纯文本判断，暴露了三个缺口：

1. **PR 格式检查靠猜**：交付规范要求 PR 首行有 `Closes #N`，但 CEO 的输入只有 issue body 与 comments 文本，评论里通常只贴 PR 链接、不贴 PR 正文，CEO 只能凭文本猜测 PR 内容是否合规，出现"没真的去看就提醒"的误判。
2. **感知不到 PR 冲突**：PR 的可合并状态只存在于 GitHub PR API，不在 issue 文本里，CEO 无法在验收时提醒 dev 修复冲突。
3. **免确认操作空转**：dev 就低风险既定操作（如从最新 `origin/main` 创建 feature 分支）向用户征求同意时，CEO 没有任何规则可介入，对话停摆等待用户。

## 提案

1. **授权 CEO 在子进程内用 `gh` 核实 PR 真实状态**：`agents/ceo.md` 新增核实章节——凡要对 PR 下判断（交付规范、冲突、交付完成度），必须先对上下文中出现的完整 PR 链接执行 `gh pr view <url> --json title,body,state,mergeable,mergeStateStatus`，基于真实数据判断；查询失败时不基于猜测介入。
2. **新增"PR 冲突"业务场景**：核实到 open PR 处于冲突状态时 `append` 一条 `@dev` 修复冲突的评论；merged / closed 跳过；不做去重（dev 每提交一次、CEO 验收一次）。
3. **新增"免确认操作放行"业务场景**：dev 向用户征求清单内操作（从最新 `origin/main` 建 feature 分支、把方案落盘到 `openspec/changes/`）的同意时，CEO `append as=ceo` 直接授权继续；清单外操作（进入实现、push、创建/合并 PR、删除类）仍等用户。
4. **`DEFAULT_CEO_TIMEOUT_MS` 60 秒 → 300 秒**：CEO 现在要真跑 `gh` 命令，60 秒必撞超时 fail-open。

## 影响

- `agents/ceo.md`：persona 层承载全部新业务判据（符合"事故规则扩展只改 ceo.md"的既定约束）。
- `src/format-ceo.ts`：仅超时常量一处，fail-open 语义不变。
- `openspec/specs/github-issue-runner/spec.md`：识别场景从四类扩为六类；新增 persona 层 gh 核实要求并澄清与"format-ceo.ts 不调 GitHub"红线的边界。
- 对外行为：CEO 判断更准（基于真实 PR 状态）、新增冲突提醒与授权放行两类 append 评论；极端情况下评论发布延迟上限从 1 分钟变为 5 分钟。
