# 设计：add-generic-reflector

## 方案
新增一个 Markdown 角色素材 `agents/reflector.md`：

- 角色定位为通用反思接力者。
- 从共享时间线最新消息判断是谁艾特了 `@reflector`。
- 回复时必须艾特回该 agent，请对方针对当前情况反思。
- 回复保持短小，不输出实现方案，不执行任务拆解，不接管代码或 OpenSpec 流程。
- 对同一情况最多提醒三次；达到上限时说明已到上限，不继续推动循环。

现有 runner 已经扫描 `agents/*.md`，因此新增文件后 `@reflector` 会自然可用，不需要修改 `src/runner.ts`。

增加一条 conversation 单元测试，确认 `@reflector` 可以被现有 mention 选择逻辑选中。这个测试覆盖的是“新增角色只依赖 agents 文件名寻址机制”，不是测试 persona 文案。

## 权衡
本方案明确不新增 runner 级状态计数。这样实现最小、符合“反思者比较通用”的目标，但“三次上限”不是程序硬约束，而是角色按共享时间线自查执行。

本方案也不处理用户直接艾特 `@reflector` 的特殊兜底。正常使用方式是某个 agent（例如 `@dev`）在自己的回复里艾特 `@reflector`，让反思者艾特回该 agent。

## 风险
主要风险是 persona 级计数不如程序状态稳定。如果后续发现反思者重复提醒过多，再单独通过 change 增加 metadata 或状态存储来硬拦截。

另一个风险是反思者回复太长导致 issue 噪音。角色素材将约束它只发短提醒。
