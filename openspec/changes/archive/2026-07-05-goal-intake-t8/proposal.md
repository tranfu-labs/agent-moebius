# 提案：goal-intake-t8

## 背景
里程碑 3 的 T1-T4 已经把目标账本、阶段作用域、CEO 编排、集成验收 join 的底层能力铺好，但用户侧入口仍缺失：用户只会在 issue 中口语化表达“我想做 X”，却必须懂 mention 协议、目标拆解、阶段、账本和 spawn 流程才能启动长期目标。T8 要补齐这条入口，解决 M3 背景中的“部分目标一次只被接收、缺采访入账步骤”。

需求持有者已确认本任务不是只新增剧本文件，也不是 dogfood T9/T10；本任务要实现“用户表达目标 -> CEO 有界采访 -> pending ledger 入账 -> 提案确认 -> 激活阶段一 -> 复用既有 spawn 创建阶段一子 issue”。

## 提案
新增 `goal-intake` 工作流，并把它接入现有 CEO 普通 agent 编排路径：

1. 无 mention 目标兜底：active issue 的最新外部无 mention 消息，以及新进入处理路径的 issue body，在 CEO 式兜底路由中识别明显目标形状；命中时只追加一条含单个 `@ceo` 的路由评论，本轮不直接入账或 spawn。
2. CEO 剧本：新增 `agents/ceo-scripts/goal-intake.md`，使用新 action `goal_intake`，约束 CEO 只能走 `interview / propose / confirm` 三种 mode。
3. bootstrap CEO context：当当前 issue 尚未关联 active ledger owner 时，CEO prescript 不再直接阻断，而是注入“intake bootstrap”上下文；该上下文只允许 goal-intake，不开放既有 spawn / roundtable 能力。
4. pending 入账：`goal_intake.propose` 校验并写入 goal、2-5 个粗里程碑、阶段一 pending phase、3-7 个阶段一 pending task，每个 task 1-3 条验收语句；发布待确认提案评论。
5. 确认后 spawn：`goal_intake.confirm` 校验用户确认的是同一个 pending proposal，再把 goal / task 转 ready、激活阶段一，并把阶段一 task descriptor 交给既有 T3 spawn executor 创建 / 找回 child issue、写回 child refs。
6. switch_phase 仅预留契约：在 spec 与 goal-intake 剧本中记录阶段一集成验收通过后的 `switch_phase` 回访契约；本 change 不做通用阶段切换自动触发，也不实现 T9/T10 dogfood。

## 影响
- 运行时：`src/runner.ts`、`src/ceo-orchestration.ts`、`src/ceo-scripts.ts`、`src/agent-prescripts/ceo-ledger-context.ts`。
- 账本：`src/goal-ledger.ts` 需要新增纯 helper 以构造 pending goal intake bundle、确认 proposal、激活阶段一；IO 仍经 `goal-ledger-state.ts` adapter。
- Persona / 剧本：`agents/ceo.md` 的无 mention 目标判据与普通 CEO agent goal-intake 场景，新增 `agents/ceo-scripts/goal-intake.md`。
- 事实源：更新 `openspec/specs/goal-ledger/spec.md`、`openspec/specs/github-issue-runner/spec.md`，实现完成归档时更新 roadmap T8 验收证据并勾选 T8。
- 测试：覆盖 issue body / comment 无 mention 路由、目标 handoff 发布失败、采访上限、pending 入账、确认后 spawn、幂等重试、active 但 child ref 不全恢复、fail-closed 评论发布失败、支付宝模拟文本不触发真实 dogfood，以及 issue 文本不进入 shell。
