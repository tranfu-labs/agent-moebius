# 设计：require-dev-plan-acceptance-statements

## 方案
在 `agents/dev.md` 的交互契约中补充 `plan-written` 方案内容要求：

1. 增加一个专门小节，说明 `plan-written` 响应在 stage marker 前的方案正文末尾必须包含「验收语句」。
2. 规定每条验收语句都是一句机械可执行检查，数量与方案功能点一一对应。
3. 给出两类格式示例：
   - UI：`打开 X → 做 Y → 应看到 Z`
   - 非 UI：`跑 X → 应输出/退出码 Z`
4. 强调 stage marker 仍必须是整条回复最后一行，因此「验收语句」是方案正文末尾，不替代 stage marker。

spec-delta 写入 `openspec/changes/require-dev-plan-acceptance-statements/spec-delta/github-issue-runner.md`，用新增规则和场景描述 dev persona 的 `plan-written` 输出契约。

## 权衡
- 只改 `agents/dev.md`，不改 runner：这是 persona 行为约束，不需要运行时代码识别或阻断。
- 不新增测试文件：product-manager 已确认第 2 条验收可用本地 dry-run 构造时间线完成；本任务目标是规则层闭环，不把 dry-run 升级成长期自动化测试要求。
- 不改 `agents/ceo.md`：CEO 对缺失验收语句的路由属于里程碑 T2，本任务 T1 只让 dev 产出验收语句。

## 风险
- persona 约束依赖 LLM 遵循，无法像 runtime 校验一样强制阻断。后续 T2 会让 CEO 在 dev 方案缺失验收语句时要求补齐，形成二级兜底。
- 如果验收语句写得过宽，验收角色仍难以机械判断；通过明确格式示例和“一条对应一个功能点”降低这个风险。

## 验证计划
- 文本检查：打开 `agents/dev.md`，查找 `plan-written` 与「验收语句」，确认存在强制要求和 UI / 非 UI 两类格式示例。
- 本地 dry-run：构造一个模拟需求和模拟 dev `plan-written` 响应，检查响应正文末尾的「验收语句」节至少包含 1 条符合指定格式的语句。
- 回归命令：运行 `pnpm test` 与 `pnpm typecheck`，确认文档 / persona 改动没有破坏现有项目检查。
