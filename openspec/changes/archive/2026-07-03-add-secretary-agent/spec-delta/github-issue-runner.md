# github-issue-runner spec delta

## 新增
- MUST 提供 `agents/secretary.md` 作为普通 Codex driver agent persona，与 `dev`、`dev-manager`、`product-manager`、`hermes-user` 同级、同样以 `agents/*.md` 文件名自动发现加载；其核心职责为采访并沉淀 CEO guardrail 漏判反馈，维护 `agents/ceo.md` 及相关 specs/tests/docs。
- MUST 让 `agents/secretary.md` 通过 frontmatter 声明受信任 preScript `src/agent-prescripts/current-repo-workspace.ts`，使 secretary Codex cwd 固定为 agent-moebius 当前仓库根目录。
- MUST 提供 `src/agent-prescripts/current-repo-workspace.ts` 并将其加入 agent preScript 静态 registry；该 preScript MUST 只返回当前仓库根目录作为 `codexCwd`，MUST NOT 创建 worktree、MUST NOT 读写 `.state/*`、MUST NOT 执行来自 issue body/comment 的内容。
- MUST 让 secretary 在处理 CEO 漏判反馈时先采访；采访至少覆盖触发输入模式、应输出模式、适用 / 不适用边界、是否需要补救当前 issue。信息不足时 MUST 停下问，信息足够时按 OpenSpec 流程维护 CEO 规则。
- MUST 让 `agents/secretary.md` 每条响应末尾以 `<!-- agent-moebius:stage=in-progress -->` 结尾；secretary MUST NOT 使用 dev 专属的 `plan-written` / `code-verified` 阶段语义。

## 修改
- MUST 让 `agents/ceo.md` 承载协作生态认知，至少包含：真实可通过 mention 触发的 Codex agent 清单（当前为 `dev`、`dev-manager`、`product-manager`、`hermes-user`、`secretary`、`tranfu-agents-manager`）；系统中不存在 reflector、reviewer、manager 等可交互对象；历史 `<reflector>` / `stage-hook` 评论只作为旧公开上下文，不代表当前仍有可触发角色；各 agent 常犯错误的经验清单（至少含 dev：把历史 reflector 评论当真人汇报、等待不存在的角色、收到提醒后只做确认式回复无实质推进）。
- `append` 的 `as` MUST 在 `{ceo, dev, dev-manager, product-manager, hermes-user, secretary}` 集合内，默认 `ceo`；`as=ceo` 时 body 不带 stage marker。`agents/ceo.md` 的 `as` 允许集合与 `src/format-ceo.ts` 的 `CEO_APPEND_ROLES` 白名单 MUST 与该集合保持一致。
- MUST NOT 把 `ceo` 加进 `availableAgentNames`；CEO 不是 mention codex agent，`@ceo` 不应触发 codex 调用。CEO 规则进化入口是 `@secretary`。
