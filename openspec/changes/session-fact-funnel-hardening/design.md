# 设计：session-fact-funnel-hardening

## 本 change 负责的验收落点

| 验收 | 落点 | 现状 |
| --- | --- | --- |
| adr-0004（唯一事实源/单写者的不变式化） | worker 消息命令派发闸门 + 两个旁路函数 | 旁路可调用且静默成功 |

## 审计发现（reflect 段以此核对）

- `src/local-console/t5-store.ts:19-38`：`createLocalChildSession` 直调 `runSqliteStateCommand("local-create-child-session")`；调用方 `tests/local-console.test.ts`、`scripts/acceptance/local-console-t5.ts`。
- `src/local-console/child-session-summary.ts:95-119`：`recordLocalChildSessionCard` 直调 `local-record-child-session-card`；全库无调用方。
- `src/sqlite-state-worker.ts:181-243`：顶层派发直接处理 `local-append-user` / `local-record-agent-response` / `local-record-system` / `local-create-child-session` / `local-record-child-session-card` 等并 INSERT `session_messages`（:1719/:1904/:2002/:2048），不经 `local-commit-session-fact-write`。
- 生产 runtime 全部消息写入走 `store.*` / `sessionFactStore()` → `runFact` → `local-commit-session-fact-write`（runtime.ts:511/560/713/760/827/884/922/948/966/1022/1195 等）——闸门不得破坏这条主路径。
- 行号以审计时（main = 1e04f8f 后）为准，实施时重新定位。

## 方案

1. worker 顶层派发中，消息类命令列一张白名单外的闸门：非 `local-commit-session-fact-write` 携带的消息写请求显式抛错，错误信息指向 ADR-0004。迁移（`local-…-migration`）与重建（rebuild）内部命令保留。
2. 删除 `recordLocalChildSessionCard`；`createLocalChildSession` 改为经 store 漏斗实现（或与 t5 兼容层一起下线，视其验收脚本仍需与否——脚本仍在则改道，不删验收）。
3. 新增测试：直调旧消息命令 → 抛错；漏斗路径回归不受影响。

## 权衡

- 显式抛错优于静默改道：旁路调用是编程错误，报错让分叉在测试期暴露，而不是把错误用法悄悄修成对的。
- 不在本 change 里清理整个 t5 兼容层：只处理审计点名的两个旁路，避免范围膨胀。

## 风险

- 白名单漏列某个合法内部命令导致误拦：以生产 runtime 的调用清单为基线逐一核对，测试覆盖全部门面方法。
