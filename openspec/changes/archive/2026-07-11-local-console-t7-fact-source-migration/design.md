# 设计：local-console-t7-fact-source-migration

## 方案
1. 在 `spec-delta/github-issue-runner/spec.md` 中标记迁出范围：删除 `Observer` 与 `T7 Observer 账本 UI` 的呈现类要求/场景，只保留 GitHub runner 核心链路规格。
2. 在 `spec-delta/local-console/spec.md` 中新增辅助 observer 诊断与 ledger 呈现要求：`local-console` 单一业务域承载 ledger-first 树、GitHub issue/comment/artifact/run trace 的只读展示、legacy issue/run 诊断、读取失败 fallback、零写入零外部命令边界；observer 仍是独立旁路，不并入本地会话状态机。
3. 在 `wireframes.md` 中以 `docs/wireframes/pages/console.md` 为基线，把 observer 页面必要内容作为辅助只读诊断章节并入同一页面事实源，并声明归档时删除 `docs/wireframes/pages/observer.md`、同步 `docs/wireframes/flow.md` 移除 observer 独立主流程。
4. 验证只检查事实源迁移与回归：用 `rg` 确认正式 spec/flow 不再把 `observer.md` 或 `T7 Observer` 当主事实源，用 `pnpm test` 做总回归。

## 权衡
- 选择迁入 `local-console` 单一业务域，而不是拆到 `desktop-shell` / `console-ui` / `local-console`：符合需求侧“范围最小”裁决，避免扩大本任务为组件和桌面装配重分层。
- 选择删除 `observer.md`，而不是保留历史文档：保留历史页会继续造成“主页面事实源”歧义；历史可通过 git 和 archived change 追溯，不需要在现行 wireframes 中保留。
- 不迁移 GitHub intake、comment publication、reaction、artifact publisher 等核心 runner 语义：这些仍属于 GitHub issue runner 业务域，本次只迁移 UI 呈现事实。

## 风险
- 风险：迁出时误删 GitHub runner 核心行为规格。缓解：spec-delta 明确只删除 observer/呈现段落，保留 intake、driver、publication、artifact 等核心场景。
- 风险：console.md 吸收过多旧 observer 页面细节，导致本地操作台主界面过重。缓解：只放入诊断入口/诊断视图要求，不把诊断树变成默认对话流程。
- 回滚：恢复 `github-issue-runner` 中 observer 段落、恢复 `observer.md` 引用，并撤销 `local-console` 新增诊断呈现要求。
