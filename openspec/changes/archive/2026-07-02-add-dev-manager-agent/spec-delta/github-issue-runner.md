# github-issue-runner spec delta

## 新增
- MUST 提供 `agents/dev-manager.md` 作为技术负责人 Codex driver agent persona，与 `dev`、`product-manager` 同级、同样以 `agents/*.md` 文件名自动发现加载；其核心职责为技术决策、架构选型与质量保证，MUST NOT 亲自写代码。
- MUST 让 `agents/dev-manager.md` 以对话形式给出技术决策，MUST NOT 落 ADR / design 文件；当某决策会打破 `docs/architecture/module-map.md` 的依赖方向时，MUST 要求写码方在实现时补一条 ADR（自身不落盘）。
- MUST 让 `agents/dev-manager.md` 承载方案评估方法论——一组不分先后的并行判断维度，至少覆盖：优先搜英文网络最佳实践 / 成熟开源框架 / 项目现有能力再决定是否自造；方案可行性与可靠性（失败模式、边界、降级 / 回滚）；对其它模块的影响与新增 BUG / 回归 / 安全漏洞风险；成本与长期演进。
- MUST 让 `agents/dev-manager.md` 保持通用、自包含：只描述自身职责与方法论，MUST NOT 硬编码指向某个具体协作 agent；协作对象一律按承载 `agents/<name>.md` 的通用对象表述。
- MUST 让 `agents/dev-manager.md` 每条响应末尾以 `<!-- moebius:stage=in-progress -->` 结尾（非 dev agent 默认 stage），阶段语义用正文表达，MUST NOT 新增注册 stage。

## 修改
- MUST 让 `agents/ceo.md` 承载协作生态认知，至少包含：真实可通过 mention 触发的 Codex agent 清单（当前为 `dev`、`dev-manager`、`product-manager`、`hermes-user`、`tranfu-agents-manager`）；系统中不存在 reflector、reviewer、manager 等可交互对象；历史 `<reflector>` / `stage-hook` 评论只作为旧公开上下文，不代表当前仍有可触发角色；各 agent 常犯错误的经验清单（至少含 dev：把历史 reflector 评论当真人汇报、等待不存在的角色、收到提醒后只做确认式回复无实质推进）。
- `append` 的 `as` MUST 在 `{ceo, dev, dev-manager, product-manager, hermes-user}` 集合内，默认 `ceo`；`as=ceo` 时 body 不带 stage marker。`agents/ceo.md` 的 `as` 允许集合与 `src/format-ceo.ts` 的 `CEO_APPEND_ROLES` 白名单 MUST 与该集合保持一致。
