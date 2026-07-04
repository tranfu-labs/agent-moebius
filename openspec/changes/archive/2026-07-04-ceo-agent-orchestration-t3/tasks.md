# 任务：ceo-agent-orchestration-t3

- [x] 新增 `agents/ceo-scripts/` 三类首批剧本：`plan-review`、`post-implementation-retro`、`milestone-spawn-child-issues`
- [x] 修改 `agents/ceo.md`：增加 frontmatter prescript；分节描述 guardrail 判据与普通 agent 编排判据；CEO agent 固定 `in-progress`
- [x] 新增 `src/ceo-scripts.ts`：加载独立剧本文件，校验 workflow id / action / 模板存在且唯一
- [x] 扩展 `AgentPreScriptResult` 与 runner prompt 构造，使 preScript 可注入 prompt context
- [x] 新增 `src/agent-prescripts/ceo-ledger-context.ts` 并注册：账本缺失 / 非法 / 无当前阶段 projection 时 fail closed；成功时注入当前阶段 projection 摘要
- [x] 修改 mention trigger，使 `@ceo` 可选择 CEO agent，同时保留 `role=ceo` speaker 归一化
- [x] 新增 `src/ceo-orchestration.ts`：解析 CEO agent 结构化输出，校验 workflow、role、task id、分组、验收语句与 issue 字段
- [x] 新增 `src/github.ts` 的 `createIssue` 与 `findIssueByOrchestrationKey` adapter 与测试，确保 `gh issue create` 使用受控 argv 和 stdin，写操作不自动重试，创建前可按隐藏 orchestration key 查重
- [x] 修改 `src/runner.ts`：为 CEO agent 增加受控 orchestration 执行路径；成功创建或找回子 issue 后写带稳定 orchestration key 的 ledger child refs；重跑时先查 ledger 再查 GitHub key；失败时发布可见 fail-closed 评论且不保存 ceo role thread
- [x] 为 CEO orchestration 的 `createIssue`、ledger child ref 保存和失败评论发布补齐有界 timeout / retry outcome 处理
- [x] 让 `src/ceo-orchestration.ts` 支持 fenced JSON 后接合法 `in-progress` stage marker，并拒绝非法 JSON + stage marker
- [x] 修改 `src/format-ceo.ts`：guardrail 加载 persona 时忽略 frontmatter并附带剧本库；保持 fail-open；阻断 `agent=ceo` 的 `append as=ceo` 与 append `@ceo`
- [x] 修改外部无 mention 兜底路由，使目标不清 / 需要裁决时可追加 `@ceo`，目标明确仍可直达具体角色
- [x] 补齐单元测试：CEO 可触发、独立 role thread、账本 prescript fail-closed、剧本缺失不创建 issue、真实 spawn 子 issue、ledger child ref、title 变化 key 稳定、ledger 缺 ref 时按 GitHub key 找回、部分成功重跑幂等、createIssue 永久挂起、ledger timeout、CEO JSON stage marker、防自激、guardrail fail-open、外部 route 到 CEO
- [x] 更新 `docs/architecture/module-map.md`、`AGENTS.md` 与相关 OpenSpec specs；实现验收通过后追记路线图 T3 证据并勾选
- [x] 运行 `pnpm test` 与 `pnpm typecheck`
