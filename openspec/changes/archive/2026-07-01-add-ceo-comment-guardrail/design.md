# 设计：add-ceo-comment-guardrail

## 方案

分三层，各自职责独立：

### 层 1：宽容匹配（`src/triggers/reflector-stage-trigger.ts`）

marker 识别正则从严格匹配改为宽容匹配，允许大小写混合、marker 内部多余空白、`=` 前后空白；stage 名严格匹配 `src/stages.ts` 定义的枚举白名单。同时把 reflector 触发 stage 白名单从既有 `[plan-written, code-verified]` 保持不变，但明确 `in-progress` MUST NOT 触发。

这一层的唯一作用是**降低 CEO 触发频率**——近似合规的响应能被直接识别就不劳动 CEO。它不参与 CEO 的 fail-open 决策，也不改变现有 stage hook 去重逻辑。

### 层 2：CEO 拦截（`src/format-ceo.ts` + `src/runner.ts`）

runner 在 mention Codex 分支拿到 `rawResponse` 之后、调用 `postComment` 之前，插入 CEO 拦截。CEO 触发范围为**所有 codex agent 生成的评论**（dev / product-manager / hermes-user / 未来 agent）；`reflector-stage-trigger` 直接生成的**确定性 hook 评论**不走 CEO（它由 runner 代码生成、格式由代码保证，不是 codex 输出）；CEO 自身修正版评论也不走 CEO（用 metadata 标记识别，防循环）：

```text
codex returns rawResponse (any agent)
  → if rawResponse 已含 <!-- agent-moebius:ceo-corrected --> → postComment(rawResponse)  // 防循环
  → format-ceo.judge({
        originalRequest,        // issue body 或最初 mention 消息
        latestResponse,         // rawResponse
        agent,                  // "dev" | "product-manager" | "hermes-user" | ...
        allowedStages,          // Stage 枚举
        lastReflectorHook,      // 最近一条 reflector hook 评论 body（若有；仅 dev 事故 2 判定用得上）
    })
  → verdict.action === "NO_CHANGE" → postComment(rawResponse)
  → verdict.action === "REPLACE"
      → repaired = verdict.body
      → runner 在 repaired 末尾追加 <!-- agent-moebius:ceo-corrected --> metadata
      → 后置宽容匹配验证：repaired 末尾（metadata 之前）必须匹配某个 allowedStage marker
      → 通过 → postComment(repaired)
      → 不通过 → postComment(rawResponse)  // fail-open
  → 任何异常 / 超时 / 非法输出 → postComment(rawResponse)  // fail-open
```

`<!-- agent-moebius:ceo-corrected -->` metadata 的作用：runner 下轮读到该评论时，凭 body 里这条隐藏标记就能识别"这是 CEO 已修正过的评论，不需要再校"，判定不依赖内存中的响应通道来源；runner 重启、跨轮读取、外部编辑等场景都能正确识别。人眼可见的 CEO quote 标注保留（给人看）；metadata 是给机器看（防循环）。

`format-ceo.judge` 的实现要点：

- **无状态调用**：每次新 codex thread，NEVER 复用 dev thread、NEVER 复用上次 CEO thread；短上下文本身不该有记忆。
- **短上下文**：只塞 `originalRequest + latestResponse + agent + allowedStages + lastReflectorHook`，绝不塞完整 issue timeline。
- **解析容错**：CEO 返回若含前后空白 / markdown fence 包裹的 `NO_CHANGE`，视同 NO_CHANGE；否则视为完整修正文本。

CEO persona (`agents/ceo.md`) 承载以下四节，让用户能不改代码就调整规则：

1. **触发范围**：目前限定 dev 响应，未来可扩展。
2. **识别场景清单**：至少包含"缺失 stage marker"（事故 1）、"收到收敛指令后无推进"（事故 2）；用户可增删。
3. **输入契约**：runner 会传入的字段列表 + 语义。
4. **输出契约与修改红线**：`NO_CHANGE` 或完整修正文本；MUST NOT 改动原正文语义 / MUST NOT 删除原有内容 / MUST 保留 stage marker 在最末尾（quote 标注在 marker 之前）。

### 层 3：Prompt 强化（`agents/dev.md`、`agents/reflector.md`）

在 persona 结尾加更醒目的 stage marker 契约：**每条响应末尾必须**有 `<!-- agent-moebius:stage=<enum> -->`，附 3 个枚举定义、1-2 组正误对照示例。作用同层 1——**降低 CEO 触发频率**。不影响 CEO 层正确性。

### stage 枚举集中定义（`src/stages.ts`）

三处需要读同一份 stage 枚举：`agents/ceo.md`（prompt 白名单）、`src/triggers/reflector-stage-trigger.ts`（触发白名单）、`src/format-ceo.ts`（后置验证）。集中在 `src/stages.ts` 定义 `type Stage = "plan-written" | "code-verified" | "in-progress"` 与两个子集（`ReflectorStages = ["plan-written", "code-verified"]`、`AllStages = ReflectorStages ∪ ["in-progress"]`），避免三处漂移。

## 权衡

**不加确定性预筛（`src/format-check.ts`）：** 早期阶段避免增加复杂度。所有 dev 响应直接过 CEO；层 1 宽容匹配 + 层 3 prompt 强化已经能压低 CEO 触发频率；未来若成本压力显现再加预筛。

**发之前拦而不是发之后编辑：** GitHub 上不显示 "edited" 标记，也躲开 reflector-stage-trigger 在编辑窗口内 poll 到旧版本的边角。代价是需要在 runner 里插入一个 pre-post 拦截点，比 post-hoc PATCH 略侵入。

**CEO 输出完整改写文本 + quote 标注 CEO 修改，而非结构化补丁：** 保留 ceo.md 完全的自定义空间——用户可以在 ceo.md 定义任何形态的修正规则（补 marker、修 role 前缀、报警等），runner 层不介入文本组装。代价是 CEO 输出文本更长、有一定概率把 marker 拼错——用后置宽容匹配验证兜底：拼错就 fail-open post 原文。

**统一 stage 契约到所有 codex agent，而非只对 dev：** 所有 codex agent（dev / product-manager / hermes-user）的每条响应 MUST 以 `<!-- agent-moebius:stage=<enum> -->` 结尾。`plan-written` / `code-verified` 保持 dev 语义（其他 agent 不应发这两个 marker，发了也会被 reflector-stage-trigger 忽略——因为触发白名单还要求 speaker 是非 reflector agent、且要求 stage 语义匹配 dev 的开发阶段）；`in-progress` 作为其他 agent 的默认 stage。这样 CEO 校正逻辑对所有 agent 统一，未来加新 agent 只需继承同一契约。

**reflector 确定性 hook 评论不走 CEO：** reflector-stage-trigger 生成的 hook 评论是由 runner 代码直接拼装的，格式由代码保证不会出偏差；让它过 CEO 只会白白增加一次 codex 调用（几乎必然 NO_CHANGE）。CEO 目的是校正 codex 输出稳定性，不校正代码生成的确定性输出。

**fail-open 而非 fail-closed：** CEO 是**改善**层，不能变成新的失败源。任何 CEO 异常都直接 post 原文，保证主流程不阻塞；正确性由 CEO 命中率与后置验证保证。

**事故 2 的具体处理动作放在 ceo.md，不写死代码：** 用户明确希望 ceo.md 承载可自定义规则，事故 2 的动作（报警 / 改 marker / mention 等）由用户在 ceo.md 决定；spec-delta 层只规定"CEO MUST 按 ceo.md 定义的规则处理事故 2"，不锁死具体动作形态。

**不新增 mention 交互 agent（"新增 @ceo mention"）：** CEO 是反馈闭环（measure → compare → correct），不是新交互。让 CEO 成为独立 agent 会破坏 stage hook 是确定性评论的架构对称，且引入循环风险（CEO 需要有人监督 CEO）。

## 风险

**CEO 判定错误导致修错正文：** 靠"后置宽容匹配验证"（修正版末尾必须有合规 stage marker）+ fail-open 兜底。若 CEO 幻觉出错误的 stage，会被验证阻断落回原文；若 CEO 幻觉出正确 stage 但改坏了正文语义，后置验证发现不了——依赖 ceo.md 修改红线约束 + AI 验证流程人工核对。

**CEO 循环调用：** CEO 自己发出的评论 MUST NOT 再走 CEO。识别机制是评论 body 里的 `<!-- agent-moebius:ceo-corrected -->` metadata——runner 读到该 metadata 就跳过 CEO 拦截。这条 metadata 是持久标记（写在评论 body 里），比依赖内存中的响应通道更鲁棒（runner 重启、跨轮读取都能识别）。

**契约扩展破坏现有 agent 交互：** 所有 codex agent persona（dev / product-manager / hermes-user）都要更新，从"部分响应发 marker 或不发 marker"变成"每条都发 marker"。需要仔细：
- dev.md 保留 `plan-written` / `code-verified` 现有语义不变，把 `in-progress` 引入为"其余所有情况"的兜底。
- product-manager.md、hermes-user.md 默认 `in-progress`；他们不应发 `plan-written` / `code-verified`（那是 dev 的开发阶段语义）。
- 测试要覆盖：现有 plan-written / code-verified 触发 reflector 场景仍然工作、in-progress 不触发 reflector、非 dev agent 意外发 plan-written 时的降级行为（视 spec-delta 定义）。

**CEO 短上下文缺失关键信息：** 事故 2 依赖 `lastReflectorHook` 才能判定"收到收敛指令后无推进"；runner 需从 GitHub timeline 中定位最近一条 reflector hook body 传给 CEO。若定位逻辑漂移或找不到，CEO 只能按事故 1 规则处理，不会误判但会漏判事故 2。

**回滚思路：** 三层可独立回滚。层 1（宽容匹配）与层 3（prompt 强化）都是纯扩展，无破坏；如需回退 CEO 拦截层，runner 里插入的 CEO 分支包裹在 feature flag 后（或者直接把 `format-ceo.judge` 调用移除），回到"直接 postComment(rawResponse)"，其他层保持增强效果。stage 枚举扩展（新增 `in-progress`）与 reflector 白名单收窄需要同步回退 dev.md 契约，可通过一次逆向 change 完成。
