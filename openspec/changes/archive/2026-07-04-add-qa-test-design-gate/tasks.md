# 任务：add-qa-test-design-gate

- [x] 新增 `docs/architecture/invariants.md`：定位说明、L1（liveness）/ S1（safety）/ V1（visibility）种子条目、维护规则（qa 提议、人裁决、走 change 流程）
- [x] 新增 `agents/qa.md`：oracle 纪律、审查方法四步（经验假设清单 / 故障矩阵 / 用例二分 / 验收语句对抗审查）、豁免判据、输出契约（固定结论行）、mention 协议、stage 恒 `in-progress`、invariants 回流机制、两轮不通过终止条件
- [x] 修改 `agents/ceo.md`：生态认知加 `qa`；`plan-written` 回流目标改为一律派 `@qa`（重出方案即重审）；新增「qa 交棒兜底」场景（通过漏 mention 发起角色 / 不通过漏 mention `@dev` 时 CEO 补交棒，正常时 `no_change`）；`as` 枚举加 `qa`；免确认清单第 3 条措辞同步
- [x] `src/format-ceo.ts`：`CEO_APPEND_ROLES` 加 `"qa"`；`pnpm test` 回归须绿
- [x] 修改 `docs/roadmap/milestone-task-issue-template.md` 协作方式节：插入 qa 审查环节说明
- [x] AI 验证 1（回归基准）：以 2026-07-02 harden change 的 design.md 为待审方案干跑 qa persona，须点名「gh 子进程 × 永久挂起」未覆盖并判不通过
- [x] AI 验证 2（豁免）：纯文档方案干跑 qa persona，须一句话豁免并转发起角色
- [x] AI 验证 3（路由与兜底）：三份构造上下文干跑 CEO persona——dev `plan-written` → mention `@qa`；qa 通过但漏交棒 → 兜底 mention 发起角色；qa 不通过且已 mention `@dev` → `no_change`
