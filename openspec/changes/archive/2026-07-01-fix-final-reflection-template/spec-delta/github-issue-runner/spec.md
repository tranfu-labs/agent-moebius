# github-issue-runner spec-delta：fix-final-reflection-template

## 修改
- reflector stage trigger 在发布同一 `(source, stage)` 的最后一次自动反思 hook 时，MUST 在 hook 评论正文追加收敛指令。
- 最后一次自动反思 hook 的收敛指令 MUST 要求源 agent：若没有发现新问题，不要继续输出同一个 stage marker，直接按推进计划进入后续步骤；若发现新问题，说明问题与建议处理方式，然后停下等待人类检查，不要继续自动推进。
- 达到 `MAX_SELF_REFLECT` 条同 `(source, stage)` hook 后，reflector stage trigger MUST 继续返回 null，不再发布 hook 评论。

## 场景更新
### 场景 7：通用反思者 — agent 输出 stage 时触发反思接力
在原有断言后补充：

And 若这是同一 `(source=dev, stage=plan-written)` 的最后一次自动反思 hook，comment body 包含“这是该阶段最后一次自动反思”
And 最后一次自动反思 hook 要求没有新问题时直接按推进计划进入后续步骤
And 最后一次自动反思 hook 要求发现新问题时说明问题并停下等待人类检查

### 场景 26：trigger 自反 — 跨 tick 同 (source, stage) 达上限后停止
保持现有停止行为；补充前置约束：

Given 同一 issue 的 timeline 中第 `MAX_SELF_REFLECT` 条 `stage-hook source=dev stage=plan-written` metadata 对应的 hook 评论已经包含最后一次自动反思收敛指令
