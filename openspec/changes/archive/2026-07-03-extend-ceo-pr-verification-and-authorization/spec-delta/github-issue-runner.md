# spec-delta：github-issue-runner

对 `openspec/specs/github-issue-runner/spec.md` 的增删改。

## 修改

### 识别场景清单（原"四类识别场景"条目）

原条目：

> MUST 让 `agents/ceo.md` 至少覆盖四类识别场景（全部走 `append`）：① `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified`（阶段反思强制介入）；② 工作明显未完成、或已交付但不符合规范（持续推进）；③ 交付规范细则不满足（如 PR 缺 `Closes #N` 字样、评论中 PR 不是链接形式）；④ 死锁等待——……

改为：

> MUST 让 `agents/ceo.md` 至少覆盖六类识别场景（全部走 `append`）：① `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified`（阶段反思强制介入）；② 工作明显未完成、或已交付但不符合规范（持续推进）；③ 交付规范细则不满足（如 PR 缺 `Closes #N` 字样、评论中 PR 不是链接形式）；④ 死锁等待——agent 的最新响应在等待一个不存在或不会响应的对象（如把历史 reflector 评论当真人、等待系统中不存在的 reviewer / manager），CEO 追加评论纠正认知并直接裁决下一步；⑤ PR 冲突——核实到 `state=OPEN` 且 `mergeable=CONFLICTING` 的 PR 时，`append` 一条 `@dev` 修复冲突的评论，merged / closed 的 PR MUST 跳过，MUST NOT 做去重（每次验收看到冲突即提醒）；⑥ 免确认操作放行——`dev` 的 `latestResponse` 在向用户征求免确认清单内操作的同意时，`append as=ceo` 直接授权继续。

### CEO 超时默认值

- 原：`DEFAULT_CEO_TIMEOUT_MS = 60_000`（若 spec 有相应表述）。
- 改为：MUST 让 `format-ceo.ts` 的 `DEFAULT_CEO_TIMEOUT_MS = 300_000`，为 CEO 子进程内执行 `gh` 核实留出时长余量；超时取消子进程并 fail-open 发原文的既有语义不变。

## 新增

- MUST 让 `agents/ceo.md` 承载「PR 真实状态核实」要求：CEO 对 PR 下任何判断（交付规范细则、冲突、交付完成度）前，MUST 先对上下文中出现的完整 PR 链接 `https://github.com/<owner>/<repo>/pull/<n>` 在其 Codex 子进程内执行 `gh pr view <完整URL> --json title,body,state,mergeable,mergeStateStatus` 核实；MUST 使用完整 URL（CEO 运行目录不在目标仓库）；MUST NOT 仅凭评论文本猜测 PR 内容；`gh` 查询失败时 MUST NOT 基于猜测介入，保守输出 `no_change`（纯文本层即可确定的问题除外，如"评论中 PR 不是链接形式"）。
- 澄清既有红线边界：`src/format-ceo.ts` 代码层 MUST NOT 自行调用 GitHub、读取 `.state/*` 或本地 intake state 的约束**不变**；PR 核实发生在 CEO Codex 子进程内部，属 persona 层行为，不经过 runner 的 GitHub adapter，不与该红线冲突。
- MUST 让 `agents/ceo.md` 承载免确认操作清单（授权边界只存在于 ceo.md，`agents/dev.md` 行为不变）：
  - 清单内（CEO 直接放行）：从最新 `origin/main` 创建 feature 分支；把方案落盘到 `openspec/changes/`。
  - 清单外（仍等用户）：进入实现阶段（"开始写代码"闸门）、push、创建 / 合并 PR、任何删除类操作。
- MUST 让交付规范中 `Closes #N` 的检查对象为核实到的 PR body，而非评论文本。

## 新增场景（Given/When/Then）

### 场景：CEO 核实到 PR 冲突

- Given issue 上下文中出现一个完整 PR 链接，该 PR `state=OPEN` 且 `mergeable=CONFLICTING`
- When runner 调用 CEO guardrail 校正本轮 agent 响应
- Then CEO 在子进程内执行 `gh pr view` 核实后返回 `append`，正文 `@dev` 要求修复冲突

### 场景：PR 无冲突且格式合规

- Given 上下文中的 PR `state=OPEN`、`mergeable=MERGEABLE`，PR body 含 `Closes #N`
- When runner 调用 CEO guardrail
- Then CEO 返回 `no_change`

### 场景：dev 征求清单内操作同意被直接放行

- Given `dev` 的 `latestResponse` 在向用户征求"从最新 `origin/main` 创建 feature 分支"的同意
- When runner 调用 CEO guardrail
- Then CEO 返回 `append`（`as=ceo`），正文直接授权 `@dev` 继续执行该操作

### 场景：dev 征求清单外操作同意不被放行

- Given `dev` 的 `latestResponse` 在向用户征求"是否可以 push"的同意
- When runner 调用 CEO guardrail
- Then CEO 不因免确认放行场景介入（`no_change`，除非命中其他场景）

### 场景：gh 核实失败时保守处理

- Given 上下文中出现 PR 链接但 `gh pr view` 执行失败
- When runner 调用 CEO guardrail
- Then CEO MUST NOT 基于猜测对该 PR 下判断（仅纯文本层可确定的问题仍可介入）
