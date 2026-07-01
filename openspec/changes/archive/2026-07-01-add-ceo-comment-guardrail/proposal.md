# 提案：add-ceo-comment-guardrail

## 背景

当前 agent 通过本机 Codex 生成的评论内容存在两类可观察到的稳定性问题，都会让 stage 接力链路失效或流程卡住：

**事故 1 — 漏发 stage marker。** dev agent 完成 `code-verified` 反思，正文明显对应终态阶段，但末尾漏发 `<!-- agent-moebius:stage=code-verified -->` marker，仅保留 `<!-- agent-moebius:role=dev -->`。结果 `resolveReflectorStageTrigger` 无法识别 stage，reflector 接力直接断链。参见 [tranfu-labs/agent-moebius#10 comment 4851370207](https://github.com/tranfu-labs/agent-moebius/issues/10#issuecomment-4851370207)。

**事故 2 — 收到收敛指令后消极响应。** dev agent 收到同一 `(source, stage)` 的最后一次自动反思 hook（含 `[MAX_REFLECT]` 收敛指令），期望是「无新问题则不再输出同一 stage marker、直接按推进计划进入后续步骤」；实际 dev 只回复"看过没问题"，没有按推进计划执行下一步动作（归档、提交、开 PR 等），流程停滞。

事故 1 是**格式偏差**，事故 2 是**行为偏差**；共同根因是 agent 输出内容缺少一层独立于原 agent 的**格式与推进 guardrail**，一旦原 agent 输出跑偏，只能靠人工发现或下一轮 active poll 兜底（且事故 2 甚至无法通过 poll 兜底，因为 self-reflect 已达上限）。

## 提案

引入 **CEO agent guardrail 层**：一个在 `postComment` 之前拦截、独立于原 agent 的 short-context 校正器；同时扩展 stage marker 契约，让格式偏差从"可发生"变成"契约违约"，便于 guardrail 判定。

具体做四件事：

1. **扩展 stage marker 契约。** 引入 stage 枚举 `plan-written` / `code-verified` / `in-progress`；MUST 让 dev agent 的每条响应末尾都显式声明 stage，而不仅在两个终态发 marker。`in-progress` 表示"还在干活 / 采访 / 澄清，不需要接力"，reflector-stage-trigger MUST 忽略之。
2. **新增 CEO agent persona `agents/ceo.md`。** 承载识别场景清单、输入契约（短上下文：原始需求 + 最新响应 + agent 名 + allowedStages + lastReflectorHook）、输出契约（改写后完整文本 + 结尾 quote 标注 CEO 修改；或 `NO_CHANGE`）、修改红线（MUST NOT 改动语义 / MUST NOT 删除原有内容 / MUST 把 stage marker 保留在最末尾）。事故 2 的具体处理动作由 ceo.md 内定义，不写死在代码里。
3. **runner 在 postComment 前插入 CEO 拦截。** codex 返回 rawResponse → 调 CEO（agents/ceo.md persona，无状态 thread，仅 dev 触发的响应走 CEO；CEO 自己的评论 MUST NOT 再次走 CEO 避免循环）→ 若 CEO 返回修正版则跑一次宽容匹配后置验证 → 通过则 post 修正版，否则 fail-open post 原文。任何 CEO 异常（超时、非法输出、后置验证不通过）一律 fail-open。
4. **reflector-stage-trigger 宽容匹配 + 白名单收窄。** marker 识别正则允许大小写、空白容错；stage 白名单只保留 `plan-written` / `code-verified`；`in-progress` MUST NOT 触发 reflector。

## 影响

- **`agents/dev.md`**：契约变更 — 每条响应必须以 stage marker 结尾，新增 `in-progress` 枚举，并给出正误示例。
- **`agents/reflector.md`**：同步 marker 契约约束（若适用）。
- **`agents/ceo.md`**（新增）：CEO persona；未来事故规则由用户在此文件自定义扩展。
- **`src/format-ceo.ts`**（新增）：加载 ceo.md、组短上下文、调 codex、解析、后置宽容匹配验证。
- **`src/stages.ts`**（新增）：集中 stage 枚举，供 format-ceo、reflector-stage-trigger、dev.md 契约测试共用，避免三处漂移。
- **`src/runner.ts`**：mention Codex 分支在 postComment 之前插入 CEO 拦截；CEO 自身发出的评论标记来源以避免循环。
- **`src/triggers/reflector-stage-trigger.ts`**：marker 匹配宽容化、白名单收窄。
- **`AGENTS.md`**：新增 CEO 拦截层与 stage 枚举扩展的说明。
- **`openspec/specs/github-issue-runner/spec.md`**：归档时合并本次 spec-delta。
