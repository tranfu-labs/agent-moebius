# 提案：align-reflector-stage-names

## 背景
`agents/dev.md` 的可输出阶段已改为 `plan-written` 与 `code-verified`，但 reflector stage trigger、测试与事实规格仍使用旧阶段 `plan-confirmed` 与 `code-complete`。因此 dev agent 输出新 stage metadata 时，runner 会把它当作 unsupported stage，无法触发 reflector hook 评论。

## 提案
将 reflector stage trigger 的受支持阶段统一为 `plan-written` 与 `code-verified`，并同步更新 dev/reflector agent 文档、单元测试、项目操作手册与 `github-issue-runner` 事实规格。

## 影响
- 影响 `agents/dev.md` 与 `agents/reflector.md` 中声明的 stage 协议。
- 影响 `src/triggers/reflector-stage-trigger.ts` 的 stage 白名单。
- 影响 trigger 单元测试与 `openspec/specs/github-issue-runner/spec.md`。
- 旧阶段 `plan-confirmed` 与 `code-complete` 不再触发 reflector。
