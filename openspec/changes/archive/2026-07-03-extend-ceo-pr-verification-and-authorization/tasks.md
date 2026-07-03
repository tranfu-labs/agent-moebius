# 任务：extend-ceo-pr-verification-and-authorization

- [x] `agents/ceo.md` 新增「PR 真实状态核实」章节（gh pr view 完整 URL、禁止猜测、失败保守 no_change）
- [x] `agents/ceo.md` 交付规范章节：`Closes #N` 检查对象改为核实到的 PR body
- [x] `agents/ceo.md` 新增业务场景「PR 冲突」（OPEN + CONFLICTING → append @dev 修冲突；merged/closed 跳过）
- [x] `agents/ceo.md` 新增业务场景「免确认操作放行」（清单：建 feature 分支、落盘 openspec/changes；排除：进入实现、push、建/合 PR、删除）
- [x] `src/format-ceo.ts` `DEFAULT_CEO_TIMEOUT_MS` 60_000 → 300_000
- [x] `tests/format-ceo.test.ts` 检查并更新引用旧默认超时的断言（检查结果：无任何引用，测试均注入 timeoutMs，无需改动）
- [x] 跑 `pnpm test`（359 通过）+ `pnpm typecheck`（通过）
- [ ] AI 验证用例 1：含冲突 PR 链接 → append 提醒 @dev 修冲突（未执行：需要在真实仓库伪造冲突 PR，属对外动作，留待真实冲突出现时观察）
- [x] AI 验证用例 2：无冲突且格式合规 PR（真实 PR #27）→ no_change，且 stdout.jsonl 确认子进程执行了 `gh pr view`
- [ ] AI 验证用例 3：PR body 缺 `Closes #N` → append 格式提醒（未执行：同用例 1，需伪造真实 PR）
- [x] AI 验证用例 4：dev 征求"从 origin/main 建 feature 分支"同意 → append as=ceo 直接授权
- [x] AI 验证用例 5：dev 征求"是否可以 push"（清单外）→ no_change 不放行
