# 提案：add-generic-reflector

## 背景
当前 runner 已支持通过 `agents/*.md` 文件名寻址 agent：最新 issue 消息包含 `@<agent-name>`，且对应 Markdown 存在时会触发该 role 的 Codex thread。

在 issue 协作里，`@dev` 需要在方案确认后与代码完成后主动停下来反思，但反思动作不需要一个专门懂业务的 agent，也不需要 runner 自动判断场景。更简单的方式是提供一个通用反思者角色：谁艾特它，它就艾特回去，提醒对方进行反思。

## 提案
新增 `agents/reflector.md`，作为通用反思接力角色。它不接管实现、不写方案、不代替 reviewer 审查，只把最新消息中艾特它的 agent 再艾特回去，并要求对方围绕当前情况做反思。

同一情况最多提醒三次的约束由角色素材说明，不新增 runner 状态或硬拦截逻辑。

## 影响
- `agents/reflector.md` 成为可通过 `@reflector` 触发的本地 agent。
- `github-issue-runner` 行为规格补充通用反思者角色约定，但运行时触发机制不变。
- 不引入新的 pre script、状态文件、GitHub 权限或外部命令。
