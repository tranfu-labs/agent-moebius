# 提案：session-fact-funnel-hardening

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/adr/0004-jsonl-session-fact-log.md | 决策 · 配套规则 | 「每会话 jsonl 是消息与会话事件的唯一事实源」「单写者」 | 已写入 |

来源：2026-07-22 规则句增量审计（session-input-and-fact-log loop，audit-findings.md）。引句「每会话一个只追加的 jsonl 事实日志，作为消息与会话事件…的唯一事实源」的字面反例：

- `src/local-console/t5-store.ts:19-38` `createLocalChildSession` → worker 命令 `local-create-child-session` 直写子会话与初始消息行，不追加 jsonl（调用方仅测试与验收脚本）。
- `src/local-console/child-session-summary.ts:95-119` `recordLocalChildSessionCard` → `local-record-child-session-card` 直写卡片消息行，全库无调用方（死写路径）。
- 根因：`src/sqlite-state-worker.ts:181-243` 顶层派发仍直接处理全部消息类命令并 INSERT `session_messages`，不经 `local-commit-session-fact-write` 漏斗——生产 runtime 已全程走漏斗，但旁路在产品源码中保持可调用。

## 背景

session-jsonl-fact-log 已把生产 runtime 的全部消息产出点接入「先事实后索引」的提交漏斗，但 worker 层的旧消息命令与两个已导出的旁路函数仍能绕过 jsonl 直写消息索引。只要旁路可调用，「唯一事实源」就只是运行期惯例而非不变式；后来者拿旧命令写消息不会有任何报错，索引与事实日志将静默分叉。

## 提案

- 移除死写路径 `recordLocalChildSessionCard`（无调用方）。
- 把 `createLocalChildSession`（t5 遗留）改走事实漏斗，或随 t5 兼容层评估后移除；其测试/验收脚本调用方同步迁移。
- 收紧 worker 顶层派发：消息类命令只允许经 `local-commit-session-fact-write` 进入；直调旧消息命令时显式报错（或将旧命令降级为仅供迁移/重建内部使用）。
- 为「绕过漏斗直写 session_messages 必须失败」补测试。

## 影响

受影响模块：

- `src/sqlite-state-worker.ts` —— 顶层派发对消息类命令的闸门。
- `src/local-console/t5-store.ts` / `src/local-console/child-session-summary.ts` —— 旁路函数移除或改道。
- `tests/` 与 `scripts/acceptance/` 中引用上述旁路的用例 —— 同步迁移到漏斗路径。

对外行为：无界面变化；绕过漏斗的内部调用由静默成功变为显式失败。

保持不变：生产 runtime 的消息写入链路（已走漏斗）；迁移与重建命令的内部使用；jsonl 文件格式与布局；ADR-0003 的 Worker 生命周期决策。
