# github-issue-runner spec delta

## 新增
- MUST 提供 `agents/reflector.md` 作为通用反思接力角色；`@reflector` 通过既有 `agents/*.md` 文件名寻址机制触发。
- `reflector` MUST 只提醒最新消息中艾特它的 agent 进行反思，MUST NOT 接管需求、方案、实现、测试或归档工作。
- `reflector` SHOULD 对同一情况最多提醒三次；该约束由角色素材基于共享时间线自查执行，不要求 runner 维护硬状态。
