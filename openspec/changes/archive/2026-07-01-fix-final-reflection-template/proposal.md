# 提案：fix-final-reflection-template

## 背景
当前 reflector stage trigger 会对同一 issue timeline 中同一 `(source, stage)` 最多发布 `MAX_SELF_REFLECT = 3` 次 hook 评论。这个上限解决了跨 tick 反思发散，但第三次反思请求的模板仍只是普通的“请针对当前 stage 做一次反思”。

实际 issue #59 中，dev 在第三次反思后仍输出同一个 stage marker。因为同 `(source, stage)` 的 hook 数已经达到上限，trigger 层后续返回 `null`，runner 不再发布新的 hook，流程停在同一 stage。问题不是上限本身，而是最后一次自动反思没有告诉 dev 如何收敛：无新问题时应继续后续步骤，有新问题时应停下等待人类检查。

## 提案
保留现有触发机制、上限、metadata 和 runner 自反循环，只修改 reflector hook 的最后一次模板：

- 前 `MAX_SELF_REFLECT - 1` 次仍使用现有短提醒：`@dev 请针对「<stage>」做一次反思。`
- 当当前 hook 是该 `(source, stage)` 的最后一次自动反思请求时，在评论正文追加收敛指令：
  - 如果没有发现新问题，不要继续输出同一个 stage marker，直接按推进计划进入后续步骤。
  - 如果发现新问题，说明问题与建议处理方式，然后停下等待人类检查，不要继续自动推进。

这样第三次反思仍保留防发散上限，但最后一次提示会把“继续”或“停下等人”的判断交给 dev 的反思结果。

## 影响
- `src/triggers/reflector-stage-trigger.ts`：计算当前 `(source, stage)` 已有 hook 数，并在生成最后一次 hook body 时追加收敛指令。
- `tests/triggers.test.ts`：补充最后一次 hook 包含收敛指令的单元测试；保留达到上限后不再触发的测试。
- `openspec/specs/github-issue-runner/spec.md`：更新 reflector stage hook 模板规则与场景描述。
- `agents/reflector.md` 与 `AGENTS.md`：同步说明最后一次自动反思模板的收敛语义。
- 不改 runner 编排、不新增 metadata、不改变 `MAX_SELF_REFLECT` 数值、不改变 active poll 节奏。
