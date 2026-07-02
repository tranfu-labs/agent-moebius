# 提案：fix-ceo-deadlock-awareness

## 背景

真实事故（tranfu-labs/tranfu-agents-app#67，2026-07-02）：dev 对重复的 plan-written reflector hook 回复了 `@reflector 这是重复的 plan-written hook……等待 reviewer/manager 确认后进入实现阶段`。这条回复有两个问题：

1. reflector 不是真 Agent，只是 runner 基于 stage marker 确定性拼装的模板 hook，`@reflector` 不会触发任何响应；系统中也不存在 reviewer / manager 角色——dev 在等一个永远不会响应的对象，对话死锁，只能靠重复 hook 空转。
2. CEO guardrail 本应介入，却 `FAIL_OPEN reason=unknown-as`：代码（`src/format-ceo.ts`）要求 `append` 必须带 `as` 字段，但 `agents/ceo.md` 在后续手工更新（`57c2188`、`8ee7f3d`）中删掉了 `as` 字段说明，CEO 模型照当前 persona 输出的 JSON 必然缺 `as`、必然 fail-open。

## 提案

只改 `agents/ceo.md`（persona 层），不动任何 src 代码：

1. 修正输出契约：`append` 补回 `as` 字段与允许值集合，与 `CEO_APPEND_ROLES` 一致。
2. 新增「协作生态认知」章节：真实可触发 agent 清单、reflector 的真实机制、系统中不存在的角色、dev 常犯的错。
3. 新增识别场景「死锁裁决」：agent 在等待不存在 / 不会响应的对象时，CEO 追加评论纠正认知并直接裁决下一步。

刻意精简（与既有 spec 的偏离）：persona 层不再承载 `replace` action 与 S1-S3 完整场景清单——`replace` 保留在代码层作为兼容，但 `agents/ceo.md` 只要求 `no_change` / `append` 两种输出。

## 影响

- `agents/ceo.md`：输出契约、识别场景、生态认知全部变化。
- `openspec/specs/github-issue-runner/spec.md`：CEO persona 相关的既有 MUST 需按精简后的现状修改（识别场景集合、输出契约范围）。
- 不影响 `src/format-ceo.ts` / `src/runner.ts` 行为与既有测试。
