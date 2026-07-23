# 设计：local-console-recovery-resume

## 方案

### 1. 持久恢复事实

session JSONL 新增两类非消息事实：

- `codex_resume_intent`：包含恢复 id、目标 `runId`、源消息 id、入口原因（`graceful-shutdown` / `retry` / `edit-resend`）、目标 role、创建时间；编辑重发还记录新消息 id。
- `codex_resume_consumed`：记录该意图由哪个新 run 消费、最终选择 `resume` 还是 `full-fallback` 及原因。

现有 `codex_thread_link` 增加 `contextFingerprint`。指纹覆盖 role、实际 Agent Markdown、有效团队快照身份、workspace mode 与规范化 cwd。旧关联没有指纹，读取继续兼容，但恢复时降级 full。

### 2. 恢复规划

运行时 claim 消息后读取指向该源消息的未消费恢复意图，并按原 runId 查唯一 thread link：

1. session、source、role 必须一致；
2. 当前角色内容、有效团队快照和 workspace 身份重新计算出的指纹必须一致；
3. threadId 必须存在且不冲突。

全部通过时调用 `codex exec resume <threadId>`。`retry` 和正常退出使用“继续原来未完成的步骤”的窄 prompt；`edit-resend` 使用新公开消息正文与附件作为明确修正，声明新指令覆盖原指令冲突部分。验证失败时使用现有完整共享时间线 prompt 和 full 模式，并记录结构化 fallback reason。任何入口都不得按 role 或时间猜 thread。

### 3. 正常退出

Electron `before-quit` 改为一次性阻止默认退出，等待本地服务关闭完成后再真正退出。runtime `close()` 对已经收到 `thread.started` 的 active run 先写 resume intent，再 abort；其 `runtime-closing` 结果不写 user-stopped。启动 catch-up 遇到带未消费 graceful intent 的 running 消息时释放为 pending 并自动处理；没有 intent 的 orphan 保持现有 stuck 规则。

### 4. Retry 与改一改重发

- `POST /sessions/:sessionId/runs/:runId/retry` 验证可恢复的终态记录，写 retry intent，把原源消息释放为 pending，再触发处理。主时间线和子会话共用此入口。
- 改一改重发继续克隆托管附件和持久化草稿正文，同时在 renderer 的 session draft metadata 中保存原 runId。普通发送携带该 metadata；server 追加新用户消息后写 edit-resend intent，随后开始处理。发送成功或用户主动清空/替换语境后清除 metadata。

### 5. 诊断与过程

每次尝试仍生成新的 Moebius runId 和 runDir，Codex thread link 指向实际 thread。`cached_input_tokens` 作为 session 诊断事实记录，不进入普通 state DTO。过程标签按现有 source/run 规则保留全部执行，不覆盖旧尝试。

架构变化见 [before.svg](architecture/before.svg) 与 [after.svg](architecture/after.svg)。基线为 `docs/architecture/local-console-operator.svg` 和 `docs/architecture/desktop-shell.svg`。

## 权衡

- 不采用 `session + role` 的常驻 thread：它会产生跨步骤私有记忆，破坏共享时间线事实源。
- 不把恢复状态只放 SQLite 或 renderer：两者都不是 session 事实源，崩溃后无法可靠审计。
- 不自动恢复无标记孤儿：强杀后无法证明退出前状态已安全落盘，擅自重跑可能重复文件副作用。
- fallback full 优先正确性而非强制 cache 命中；恢复是优化路径，不能成为继续工作的单点依赖。

## 风险

- 退出时序竞争可能产生“意图已写但旧进程尚未退出”。通过先写 intent、设置 closing、停止新 claim、再 abort 并等待 settle 收敛。
- Retry 重复点击可能重复创建运行。恢复意图以目标 run 和终态校验幂等，session claim 仍严格串行。
- Codex rollout 被清理。规划阶段在启动 resume 前确认 thread rollout 仍可定位；不可用时直接 full，避免对一个可能已经产生副作用的通用 CLI 失败盲目重跑。
- 已有 session fact 缺少新字段。parser 向后兼容，旧 link 只失去 resume 优化，不影响 full。
- 回滚时可停止生成/消费 resume intent，所有消息仍可由既有 full 路径处理；新增 JSONL fact 对旧 projector 是可忽略事件。
