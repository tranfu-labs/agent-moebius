# github-issue-runner spec delta

## 新增

- MUST 提供 `agents/qa.md` 作为测试设计 Codex driver agent persona，与 `dev`、`dev-manager`、`product-manager`、`hermes-user`、`secretary` 同级、同样以 `agents/*.md` 文件名自动发现加载；核心职责为方案阶段的对抗性测试设计审查，MUST NOT 写实现代码，MUST NOT 亲自执行故障注入（增补用例由 dev 在实现阶段执行并附证据）。
- MUST 让 `agents/qa.md` 以 `docs/architecture/invariants.md` 与需求原文为判定标准（oracle）审查方案；MUST NOT 把方案自述当作唯一判定标准（防止审查退化为"方案做到了方案说的"式确认）。
- MUST 让 qa 对含运行时行为改动的 `plan-written` 方案执行四步审查：① 提取方案依赖的经验假设清单（外部行为事实性断言）并标注是否已验证；② 过故障矩阵（外部依赖 × {快速失败, 永久挂起, 慢成功, 状态丢失} × 流水线阶段），只列有问题的格；③ 用例二分——方案缺分支的静态可裁决缺陷当场判不通过、依赖经验假设的写成可机械执行的故障注入验收语句增补；④ 对抗性审查已有「验收语句」是否可机械执行、是否只覆盖 happy path。
- MUST 让 qa 审查评论包含固定结论行 `QA 结论：通过` 或 `QA 结论：不通过`；不通过时每条缺陷 MUST 挂靠到具体故障矩阵格或 `invariants.md` 条目，未挂靠的泛化批评视为无效缺陷。
- MUST 让 qa 按结论执行 mention 协议（一轮只一个 mention）：不通过 → mention `@dev` 逐条列缺陷与增补要求；通过 → mention 发起需求角色请其按含 QA 增补的「验收语句」逐条验收，并在正文注明增补部分。
- MUST 对不触碰运行时代码、外部依赖、状态机、agent 协作协议的纯文档 / 文案类方案豁免四步审查：qa MUST 输出一句话豁免（含理由）并直接 mention 发起需求角色。
- MUST 让 `agents/qa.md` 每条响应末尾以 `<!-- moebius:stage=in-progress -->` 结尾，阶段语义用正文结论行表达，MUST NOT 为 qa 新增注册 stage。
- MUST 让 qa 对同一需求的方案最多判两轮不通过；第三轮仍有分歧时 MUST 列明分歧点、判"有保留通过"并交人类裁决，MUST NOT 与 dev 无限空转。
- MUST 提供 `docs/architecture/invariants.md` 作为系统级不变量事实源，至少覆盖 liveness（任何单点故障不得使心跳循环或任一 issue 推进永久停转；每个外部调用必须有界时或有看门狗）、safety（intake 游标只在 GitHub 留下可见结果后推进）、visibility（放弃或降级任务必须留下可见痕迹，且痕迹发布路径本身受前两者约束）三类。qa 发现新故障类时 MUST 以补丁建议形式回流，经人类确认后合并，MUST NOT 直接修改该文件。

## 修改

- 把「MUST 让 CEO guardrail 承担阶段验收回流入口……」规则中 `plan-written` 的回流目标改为：有可用「验收语句」清单时，CEO MUST `append as=ceo` mention `@qa` 要求按测试设计流程审查本轮方案，MUST NOT 直接 mention 发起需求角色。不查历史 qa 结论——阶段回流只在 `latestResponse` 带 `plan-written` marker 时触发，任何历史结论都早于该最新方案；dev 重出 `plan-written` 即重审（幂等，防止拿旧结论放行新方案）。`code-verified` 分支与缺验收语句分支维持原规则不变。
- 新增 CEO 识别场景「qa 交棒兜底」：qa 的 `latestResponse` 含 `QA 结论：通过` 但正文未 mention 发起需求角色时，CEO MUST `append as=ceo` mention 发起需求角色要求按含 QA 增补的「验收语句」验收；含 `QA 结论：不通过` 但未 mention `@dev` 时，CEO MUST `append as=ceo` mention `@dev` 要求修正；qa 交棒 mention 正常时 MUST 输出 `no_change`。发起需求角色的识别沿用既有优先级规则。
- 把「真实可通过 mention 触发的 Codex agent 清单（当前为 `dev`、`dev-manager`、`product-manager`、`hermes-user`、`secretary`、`tranfu-agents-manager`）」中的清单更新为含 `qa`。
- 把 CEO 输出契约中 `as` 允许集合 `{ceo, dev, dev-manager, product-manager, hermes-user, secretary}` 更新为含 `qa`，并同步 `format-ceo.ts` 的 `CEO_APPEND_ROLES` 白名单。
- 把免确认操作清单第 3 条「方案经验收通过后进入实现阶段」更新为「方案经 qa 测试设计审查通过且发起需求角色验收通过后进入实现阶段」。

## 场景新增

- 场景：plan-written 无 qa 审查时 CEO 先派 qa
  Given `dev` 的 `latestResponse` 尾部 stage marker 为 `plan-written` 且含可用「验收语句」清单
  And 完整公开 issue context 中不存在 qa 针对该 `plan-written` 的审查结论
  When CEO guardrail 处理该响应
  Then CEO 输出 `append`、`as=ceo`，正文 mention `@qa` 要求按测试设计流程审查本轮方案
  And MUST NOT 在同一评论中 mention 发起需求角色
- 场景：qa 通过但漏交棒时 CEO 兜底
  Given qa 的 `latestResponse` 含结论行 `QA 结论：通过`
  And 正文没有 mention 发起需求角色
  When CEO guardrail 处理该响应
  Then CEO 输出 `append`、`as=ceo`，正文 mention 发起需求角色，要求按含 QA 增补的「验收语句」逐条验收
- 场景：qa 交棒正常时 CEO 不重复介入
  Given qa 的 `latestResponse` 含结论行 `QA 结论：不通过` 且正文已 mention `@dev`
  When CEO guardrail 处理该响应
  Then CEO 输出 `no_change`
- 场景：dev 重出方案后 qa 重审
  Given qa 曾对旧 `plan-written` 输出 `QA 结论：不通过`
  And `dev` 修正后重新输出了带 `plan-written` marker 且验收语句齐全的新方案
  When CEO guardrail 处理该新 `plan-written`
  Then CEO 输出 `append`、`as=ceo`，正文 mention `@qa` 审查新方案（历史结论不复用）
- 场景：qa 抓出方案未覆盖的故障格
  Given 待审方案对某外部子进程调用只定义了"失败即报错重试"分支
  And `docs/architecture/invariants.md` 含 liveness 不变量（每个外部调用必须有界时）
  When qa 执行故障矩阵审查
  Then qa 点名「该子进程 × 永久挂起」为未覆盖格，结论行为 `QA 结论：不通过`
  And 评论 mention `@dev` 且缺陷条目挂靠该矩阵格与 liveness 条目
- 场景：纯文档方案被 qa 一句话豁免
  Given 待审方案只修改 README 与注释、不触碰运行时代码 / 外部依赖 / 状态机 / 协作协议
  When qa 审查该方案
  Then qa 输出一句话豁免（含理由）并 mention 发起需求角色
  And MUST NOT 产出经验假设清单与故障矩阵长文
