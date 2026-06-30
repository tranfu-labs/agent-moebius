# 设计：align-reflector-stage-names

## 方案
1. 将 `REFLECTOR_STAGES` 从 `plan-confirmed` / `code-complete` 改为 `plan-written` / `code-verified`。
2. 更新 trigger 测试，使正向用例覆盖两个新 stage，去重 metadata 与 reflector 自身消息用例也改用新 stage。
3. 更新 `agents/reflector.md` 与 `AGENTS.md`，让可输出阶段、支持阶段与运行时行为一致。
4. 将同样的规则写入 `openspec/changes/align-reflector-stage-names/spec-delta/github-issue-runner/spec.md`，实现完成后归档合并回事实规格。

## 权衡
本次不保留旧 stage 兼容。`agents/dev.md` 已把对外协议改成新名字，继续兼容旧名字会让同一流程存在两套语义锚点，反而降低问题定位清晰度。

## 风险
如果仍有历史未处理的最新 agent message 使用旧 stage，它不会触发 reflector。回滚方式是恢复 `REFLECTOR_STAGES` 与相关文档/测试到旧枚举，或另行设计显式兼容期。
