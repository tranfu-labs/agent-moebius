# github-issue-runner spec delta

## 修改

- 更新既有规则「MUST 让 `agents/ceo.md` 至少覆盖三类识别场景：① 缺失或非法的 stage marker（走 `replace`）；② dev agent 收到含 `[MAX_REFLECT]` 或最后一次自动反思收敛指令的 reflector hook 后无实质推进动作（走 `append`）；③ dev agent 停下询问"是否新建 change 分支"这类可自主裁决的确认题（走 `append`，CEO 决定 `as` 身份表态"同意 dev 自行推进"）。」为：

  MUST 让 `agents/ceo.md` 至少覆盖三类识别场景（全部走 `append`）：① 工作明显未完成、或已交付但不符合规范（持续推进）；② 交付规范细则不满足（如 PR 缺 `Closes #N` 字样、评论中 PR 不是链接形式）；③ 死锁等待——agent 的最新响应在等待一个不存在或不会响应的对象（如把 reflector 当真人、等待系统中不存在的 reviewer / manager），CEO 追加评论纠正认知并直接裁决下一步。

- 更新既有规则「MUST 定义 `agents/ceo.md` 的输出契约为 JSON，仅允许以下三种结构（允许 fenced code block 包裹）：…（`no_change` / `replace` / `append` 三种）」为：

  MUST 定义 `agents/ceo.md` 的输出契约为 JSON，persona 层仅承载以下两种结构（允许 fenced code block 包裹）：
  1. `{"action":"no_change"}` — 不改动，runner 直接 post 原文。
  2. `{"action":"append","as":"<role>","body":"<CEO 追加正文>"}` — `as` MUST 在 `{ceo, dev, product-manager, hermes-user, reflector}` 集合内，默认 `ceo`；`as=ceo` 时 body 不带 stage marker。

  `replace` action 保留在代码层（`src/format-ceo.ts` 的解析与 post-validate 不变），但 `agents/ceo.md` MUST NOT 被要求承载 `replace` 的触发场景与格式约束；未来需要恢复时通过修改 `agents/ceo.md` 实现。

- 同步既有场景中对旧 persona 场景清单的引用（persona 不再承载 `replace` 与"自主裁决确认题"清单项，但代码层处理链路不变）：
  - 场景 33（dev 漏发 marker 被 CEO 补齐）：Given 改为"CEO 输出 `replace` 修正（代码层保留的能力，当前 `agents/ceo.md` 不再主动承载该场景）"，其余处理链路描述不变。
  - 场景 38：把"事故 2 规则"改为"`agents/ceo.md` 识别场景"的一般表述。
  - 场景 39.1：Then 改为"runner 按 CEO 返回的 action 分支处理 post 逻辑"，不再断言 persona 按事故 1 规则补 marker。
  - 场景 42 / 43：Given 不再断言 persona 识别场景清单包含"dev 询问可自主裁决问题"，改为断言 CEO 判定走 `append`；runner 处理链路描述不变。

## 新增

### CEO 协作生态认知
- MUST 让 `agents/ceo.md` 承载协作生态认知，至少包含：
  - 真实可通过 mention 触发的 Codex agent 清单（当前为 `dev`、`product-manager`、`hermes-user`、`tranfu-agents-manager`）。
  - reflector 的真实机制说明：runner 基于 stage marker 确定性拼装的模板 hook，不是模型、不读回复，`@reflector` 不触发任何响应。
  - 系统中不存在 reviewer、manager 等角色，等待其确认不会有结果。
  - 各 agent 常犯错误的经验清单（至少含 dev：把 reflector 当真人汇报、等待不存在的角色、收到反思提醒后只做确认式回复无实质推进），供识别场景兜底判断。
- 未来新增 driver agent 时 MUST 同步更新 `agents/ceo.md` 生态认知章节的 agent 清单（与既有的 `as` 集合同步义务并列）。

## 新增场景

### 场景：CEO guardrail — dev 死锁等待不存在的角色被 CEO append 裁决
Given dev 收到重复的 plan-written reflector hook
And dev codex 本轮返回的 `${LAST_RESPONSE}` 为 `@reflector 这是重复的 plan-written hook……当前状态：等待 reviewer/manager 确认后进入实现阶段`
When runner 调用 CEO guardrail
Then CEO 识别出 dev 在等待不存在 / 不会响应的对象
And 返回 `{"action":"append","as":"ceo","body":"..."}`，body 纠正认知（reflector 是自动 hook、系统中没有 reviewer/manager）并裁决下一步（方案已通过反思，直接进入实现）
And runner 先 post dev 原文，再以 `<ceo>:` 前缀 post CEO 裁决评论
