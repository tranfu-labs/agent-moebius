# github-issue-runner spec delta

## 新增
- MUST 让 `agents/dev.md` 要求 dev 在 `plan-written` 响应的方案正文末尾包含「验收语句」一节；该节 MUST 位于最终 stage marker 之前，stage marker 仍 MUST 是整条回复最后一行。
- MUST 让 `agents/dev.md` 要求「验收语句」中的每条语句都是一句可机械执行的检查；UI 类使用 `打开 X → 做 Y → 应看到 Z` 格式，非 UI 类使用等价可执行断言格式，例如 `跑 X → 应输出/退出码 Z`。
- MUST 让 `agents/dev.md` 要求「验收语句」数量与方案的功能点一一对应。

## 场景
### 场景：Dev agent — plan-written 方案末尾包含验收语句
Given dev 正在产出 `plan-written` 方案
When dev 完成方案正文
Then 方案正文末尾包含「验收语句」一节
And 「验收语句」中至少包含 1 条可机械执行的检查
And UI 类检查使用 `打开 X → 做 Y → 应看到 Z` 格式
And 非 UI 类检查使用等价可执行断言格式，例如 `跑 X → 应输出/退出码 Z`
And 最终一行仍为合法 `<!-- moebius:stage=plan-written -->` marker
