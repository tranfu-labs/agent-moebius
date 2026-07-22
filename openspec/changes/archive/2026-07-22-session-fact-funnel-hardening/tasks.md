# 任务：session-fact-funnel-hardening

- [x] worker 顶层派发对消息类命令加闸门：仅 `local-commit-session-fact-write`（及迁移/重建内部命令）可写 `session_messages`，其余显式抛错
- [x] 删除死写路径 `recordLocalChildSessionCard`
- [x] `createLocalChildSession` 改走事实漏斗，测试与验收脚本调用方同步迁移
- [x] 测试：直调旧消息命令抛错；全部 store 门面方法回归；t5 验收脚本仍可跑
- [x] spec-delta：为「绕过事实漏斗的消息写入必须失败」写 Requirement（local-console 域）
