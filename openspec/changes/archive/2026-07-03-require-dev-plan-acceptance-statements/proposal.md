# 提案：require-dev-plan-acceptance-statements

## 背景
里程碑 1 要把需求方验收闭环前移到方案阶段：dev 在 `plan-written` 时必须给出可机械执行的验收语句，后续 product-manager / hermes-user 才能按同一套语句验收方案与实现。

当前 `agents/dev.md` 只约束阶段 marker 与 OpenSpec 流程，没有硬性要求 `plan-written` 方案末尾包含验收语句清单。这会让后续验收角色缺少稳定输入，也让实现完成后的证据难以逐条对应功能点。

## 提案
修改 `agents/dev.md`：

- 明确 `plan-written` 响应的人类可读方案末尾必须包含「验收语句」一节。
- 每条验收语句必须是一句可机械执行的检查。
- UI 类语句使用 `打开 X → 做 Y → 应看到 Z`。
- 非 UI 类语句使用等价的命令 / 断言格式，例如 `跑 X → 应输出/退出码 Z`。
- 验收语句数量必须与方案功能点一一对应。

同步 `github-issue-runner` spec-delta，记录 dev persona 的 `plan-written` 内容契约。

## 影响
- 受影响模块：`agents` Markdown persona。
- 受影响事实源：`openspec/specs/github-issue-runner/spec.md`（通过本 change 的 spec-delta 归档后合入）。
- 不改运行时代码，不修改 `src/`。
- 不新增自动化测试硬要求；第 2 条验收按 product-manager 确认，使用本地 dry-run / 模拟 dev `plan-written` 响应提供可复核证据。
