# 提案：2026-07-03-add-secretary-agent

## 背景
当前 CEO guardrail 是发布前无状态校正器：它读取 `agents/ceo.md`，判断本轮 agent 响应是否需要 `append` 或 `no_change`。当用户发现“CEO 本该提醒但没有提醒”时，系统缺少一个干净的学习入口。

如果让 `@dev` 承担这类“进化 CEO”任务，`dev` 的 issue + role thread 会混入 CEO guardrail 规则维护上下文，影响后续普通开发对话的连续性。直接让 `@ceo` 成为普通可触发 agent 又会破坏现有职责边界：CEO 当前不维护 thread，也不作为普通 mention agent 运行。

## 提案
新增一个普通对话 agent：`secretary`（秘书），通过 `@secretary` 触发，专门处理 CEO 漏判反馈与 CEO prompt 进化。

- 新建 `agents/secretary.md` persona。职责是采访用户指出的 CEO 漏判场景，归纳触发输入模式、应输出模式、适用 / 不适用边界，并按 OpenSpec 流程维护 `agents/ceo.md`、相关 specs/tests 与文档。
- 新增受信任 preScript：`src/agent-prescripts/current-repo-workspace.ts`。它只负责把 Codex cwd 固定到 moebius 当前仓库根目录，避免 secretary 像 `dev` 一样进入目标 issue 的业务仓库 worktree。
- 将该 preScript 加入 `src/agent-prescripts/index.ts` 静态 registry，并在 `agents/secretary.md` frontmatter 中声明。
- 同步 CEO 生态认知与 append role 白名单：`secretary` 是真实可触发 Codex agent；`CEO_APPEND_ROLES` 与 `agents/ceo.md` 输出契约允许 `as=secretary`。

## 影响
- 业务域：`github-issue-runner`。
- 新增 agent：`@secretary`。
- 新增文件：`agents/secretary.md`、`src/agent-prescripts/current-repo-workspace.ts`。
- 修改文件：`src/agent-prescripts/index.ts`、`src/format-ceo.ts`、`agents/ceo.md`、`docs/architecture/module-map.md`、`AGENTS.md` 与相关测试。
- 对外行为：用户可通过 `@secretary` 发起 CEO 漏判学习流程；secretary 使用独立 role thread，且 Codex cwd 固定为 moebius 仓库根目录。
- 不改变：`@ceo` 仍不是普通 Codex mention agent；CEO guardrail 仍由 `src/format-ceo.ts` 在评论发布前无状态调用。
