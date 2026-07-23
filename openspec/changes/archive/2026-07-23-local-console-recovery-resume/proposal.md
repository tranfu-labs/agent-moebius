# 提案：local-console-recovery-resume

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 停下、重试、退出应用与恢复执行、页面状态、验收标准 | 定义同一次未完成执行的局部 resume、正常退出自动恢复与 full 降级边界 | 已写入 |
| `docs/adr/0007-local-console-full-rebuild-no-resume.md` | 决策、后果 | 保留正常步骤 full，允许按原 runId 恢复的窄例外 | 已写入 |

## 背景

本地会话已经把每个 run 到 Codex `threadId` 的关联持久化到 session JSONL，但运行时仍固定 full。桌面退出会中止活动 Codex，重启把遗留 running 一律清算为 stuck；Retry 主时间线尚未接通，改一改重发也只回填草稿。用户无法继续同一次未完成执行，已完成的探索与工具上下文被浪费。

ADR-0007 正确禁止把 resume 当作会话级或 role 级长期记忆，但它把同一次未完成执行的恢复也一并排除。两者需要拆开：常规步骤继续 full，恢复入口只续原 run 的唯一 thread。

## 提案

- 在 session JSONL 增加幂等的恢复意图与消费事实，并给 run→thread 关联增加上下文指纹。
- 正常退出先记录恢复意图再中止活动 run；启动时只自动接管有该意图的孤儿，其他孤儿仍落成 stuck。
- 为主时间线与子会话 Retry 接通按 `sessionId + runId` 的恢复 API；改一改重发在草稿中保留原 runId，提交时原子关联恢复意图。
- 运行时只按显式原 runId 选择 resume，校验角色/团队快照和工作空间身份；不可恢复时使用完整时间线 full。
- 每次恢复创建独立 Moebius run 与过程记录，持久化 Codex cached input token 供诊断，不在普通对话 UI 展示。

## 影响

影响 `src/local-console` 的 session fact、runtime、HTTP API 与测试，Electron 生命周期和 renderer 发送状态，`console-ui` 的 Retry callback，以及本地会话 PRD、ADR 和架构图。不会改变 GitHub runner、普通本地 Agent 接力规则、页面布局或工作空间文件状态。
