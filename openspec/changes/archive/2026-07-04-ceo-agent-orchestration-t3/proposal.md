# 提案：ceo-agent-orchestration-t3

## 背景
M3 T3 要把 CEO 从单一发布前 guardrail 扩展成一条可触发、可追踪、可失败的普通 agent 编排路径。当前事实源仍把 `ceo` 明确排除在可触发 Codex agent 之外，`format-ceo.ts` 只把 CEO 当无状态 fail-open guardrail 使用，外部无 mention 兜底路由也禁止把控制权交给 `@ceo`。

product-manager 已确认本任务的闭环口径：T3 必须真实 spawn 子 issue；CEO agent 只通过受测 TypeScript runner / GitHub adapter 产生副作用，不能在 Codex 会话里自由调用 `gh issue create`；剧本库必须是独立数据文件；账本 prescript 要 fail-closed 校验并注入当前阶段 projection；CEO agent 响应固定 `in-progress`，仍经过 guardrail 格式红线。

## 提案
新增 CEO 普通 agent 编排路径，保持 guardrail hook 无状态 fail-open 不变：

1. 让 `@ceo` 进入普通 mention trigger：复用 `agents/ceo.md` 一个身份文件，增加 frontmatter prescript；CEO role thread 走现有 issue + role 状态。
2. 新增独立剧本库目录 `agents/ceo-scripts/`，首批脚本为方案评审 6 项、执行后复盘 3 问、里程碑拆解 / 子 issue 创建模板。runtime 校验 workflow id 与模板文件存在。
3. 扩展 agent prescript 返回契约，允许 preScript 注入受控 prompt context；新增 CEO ledger prescript，读取 `.state/goal-ledger.json`、校验 schema、解析当前 issue 对应的 active phase projection，并把摘要注入 CEO prompt；缺账本、非法账本、无明确 projection 时 fail-closed。
4. 新增 CEO orchestration 解析与执行层：CEO Codex 只输出结构化 orchestration JSON；runner 校验 workflow、角色、任务 id、验收语句和 issue body 字段后，通过 GitHub adapter 创建父 issue 同仓库的子 issue。
5. 新增 GitHub adapter `createIssue` 与 `findIssueByOrchestrationKey`，使用受控 argv 与 stdin 创建 issue；创建前按稳定 orchestration key 在 ledger 与 GitHub 中查重，写操作不自动重试。
6. 子 issue 创建成功后，runner 只把 child issue reference / intent / status / provenance 写回对应 task 的 ledger entry，不做 GitHub 状态同步器。
7. 保持 CEO guardrail fail-open；额外加 CEO 自激环机械边界：guardrail 处理 `agent=ceo` 时不得追加 `as=ceo` 自我续写，也不得把控制权交回 `@ceo`。
8. 与 T8 汇合：手动 `@ceo` 可触发；已有外部无 mention 兜底路由在“有路由意图但目标不清 / 需要裁决”时可追加 `@ceo`，下一轮由普通 mention trigger 唤醒 CEO。

## 影响
- `agents/ceo.md`：从 guardrail-only persona 改为“一个身份、两条路径”分节，新增 frontmatter prescript 与 agent 编排输出契约。
- `agents/ceo-scripts/`：新增三类首批剧本模板，避免把 workflow 文案继续内联在 persona 中。
- `src/triggers/mention-trigger.ts`：移除 `ceo` 非 Codex mention 排除。
- `src/runner.ts`：支持 preScript prompt context、CEO orchestration 特殊执行路径、受控 issue creation、ledger child ref 回写、可见 fail-closed 评论。
- `src/agent-prescripts/`：新增 CEO ledger context prescript，并扩展 result shape。
- `src/format-ceo.ts`：加载 CEO persona 时忽略 frontmatter并附带剧本库；保留 fail-open；增加 CEO 自激环后置校验。
- `src/github.ts`：新增 `createIssue` adapter。
- `src/goal-ledger.ts` / `src/goal-ledger-state.ts`：复用现有 schema 与 entry merge；按需要补一个窄 helper 更新 task child refs。
- `tests/`：新增 / 更新触发、CEO prescript、剧本加载、orchestration parser、runner issue creation、guardrail fail-open 与自激环、外部 route 到 CEO 的单元测试。
- `docs/architecture/module-map.md`、`AGENTS.md`、`openspec/specs/*` 与路线图 T3 证据在实现归档时同步更新。

明确不做：T4 集成验收点、T5 worktree 资源化、T6 fan-out / join / 圆桌、T7 观察页、跨 repo 编排、PR / push / 删除类动作。
