# 设计：fix-final-reflection-template

## 方案
改动集中在 `src/triggers/reflector-stage-trigger.ts`。

1. 在 `resolveReflectorStageTrigger` 中先计算：
   ```ts
   const existingHookCount = countExistingStageHooks(input.timeline, latestMessage.speaker, stage);
   ```
2. 若 `existingHookCount >= MAX_SELF_REFLECT`，沿用现有行为返回 `null`。
3. 若未达上限，生成 hook body 时传入：
   ```ts
   isFinalReflection: existingHookCount === MAX_SELF_REFLECT - 1
   ```
4. `formatReflectorStageComment` 在 `isFinalReflection` 为 `true` 时追加固定收敛指令。

模板示意：

```text
<reflector>:
@dev 请针对「plan-written」做一次反思。

这是该阶段最后一次自动反思。
如果没有发现新问题，请不要继续输出同一个 stage marker，直接按推进计划进入后续步骤。
如果发现新问题，请说明问题与建议处理方式，然后停下等待人类检查，不要继续自动推进。

<!-- moebius:role=reflector -->
<!-- moebius:stage-hook source=dev stage=plan-written sourceIndex=11 -->
```

`parseStageHookMetadata` 与 hook metadata 格式不变；`sourceIndex` 仍只用于人 / 日志追溯。

### 测试
新增可测逻辑单元测试：

- 已有 `MAX_SELF_REFLECT - 1` 条同 `(source, stage)` hook 时，最新 dev stage message 仍触发 reflector hook。
- 该 hook body 包含“最后一次自动反思”、无新问题继续后续步骤、有新问题停下等待人类检查三段收敛指令。
- 已有 `MAX_SELF_REFLECT` 条同 `(source, stage)` hook 时仍返回 `null`。

AI 验证流程：

- 运行 `pnpm test`。
- 运行 `pnpm typecheck`。
- 用 `git diff --check` 检查空白错误。

## 权衡
### 选模板修复，不新增 handoff trigger
可选方案是新增 `stage-handoff` metadata 或独立 trigger，让达到上限时再发布“继续下一步”评论。这个方案会引入新协议、新去重逻辑和更多 runner 场景；而当前问题只是在最后一次反思模板里缺少收敛指令。

模板修复的优点是改动小、行为可预期，并且保持 reflector 的职责：只提醒输出 stage 的 agent 反思，不接管需求、实现或归档。dev 是否继续，仍由 dev 根据最后一次反思结果决定。

### 保留达到上限后返回 null
达到 `MAX_SELF_REFLECT` 后继续静默跳过是必要的防发散边界。区别是最后一次 hook 已经提前告诉 dev 如何处理后续，因此上限不再是无提示的“停住”。

## 风险
- dev 可能忽略最后一次模板指令，继续输出同一 stage marker。此时现有上限仍会阻止继续 hook，流程会停住；这是 agent 遵循 prompt 的问题，不是 trigger 发散问题。通过同步 `agents/reflector.md` 和测试模板降低风险。
- 回滚简单：移除 `isFinalReflection` 参数与追加文案，测试恢复到原模板断言即可。
