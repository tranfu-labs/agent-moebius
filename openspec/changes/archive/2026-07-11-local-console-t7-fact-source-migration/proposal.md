# 提案：local-console-t7-fact-source-migration

## 背景
当前 `github-issue-runner` 规格仍承载观察页的 ledger-first 展示、只读诊断、GitHub 呈现与零写入边界等 UI/呈现类事实；`docs/wireframes/pages/observer.md` 也仍是独立页面事实源。随着本地对话操作台成为默认主窗口，这些呈现事实应归位到 `local-console` 业务域与 `docs/wireframes/pages/console.md`，避免 GitHub runner 核心语义域继续混入观察页 UI 事实。

## 提案
- 将观察页的只读诊断、ledger-first 展示、零写入零外部命令、legacy issue/run 诊断、artifact link/runner trace/GitHub issue 展示等呈现类规格迁入 `local-console` 单一业务域。
- 保留 GitHub intake、comment 发布、reaction、artifact publisher、issue media、worktree、driver pool 等核心 runner 语义在 `github-issue-runner`，本次不改 runtime 语义。
- 将 `docs/wireframes/pages/observer.md` 的必要版式事实并入 `docs/wireframes/pages/console.md` 的诊断/ledger 区域，并同步 `docs/wireframes/flow.md`。
- 明确删除 `docs/wireframes/pages/observer.md`：删除比降级为历史文档更能避免它继续被当作主页面事实源引用。

## 影响
- 影响 `openspec/specs/github-issue-runner/spec.md` 与 `openspec/specs/local-console/spec.md` 的事实源归位。
- 影响 `docs/wireframes/pages/console.md` 与 `docs/wireframes/flow.md` 的版式/流程事实源。
- 不影响 `src/` 运行时代码、GitHub runner 核心行为、Electron 装配语义或 console-ui 组件契约。
