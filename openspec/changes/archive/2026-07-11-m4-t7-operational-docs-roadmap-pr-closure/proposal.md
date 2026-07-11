# 提案：m4-t7-operational-docs-roadmap-pr-closure

## 背景

M4 T7 是“默认本地对话操作台”的收尾任务。父 issue 要求把默认启动形态从 GitHub runner 转为 local，并用显式 GitHub-mode flag 进入纯 GitHub 模式；同时完成事实源迁移后的运营文档、roadmap 证据和 PR 收口。

当前 #131 只负责收尾层：更新 `AGENTS.md` 启动形态章节、追记 `docs/roadmap/milestone-4-local-console.md` 的 T7 验收证据并勾选完成、提交推送并创建收尾 PR。运行时 flag 装配由 #129 承担，spec/wireframes 事实源迁移由 #130 承担。需求侧已确认：本 change 可以先并行写方案，但任何文件修改、commit、push 和 PR 创建必须等 #129 与 #130 merge 后，以 merge 后真实状态为准。

## 提案

1. 在 #129 与 #130 merge 前，仅保留本 OpenSpec 方案，不修改 `AGENTS.md`、roadmap 或创建 PR。
2. 在 #129 merge 后，从 merge 后代码与文档事实确认 GitHub-mode flag 为 `--github-mode`，用法为 `pnpm start -- --github-mode`。
3. 在 #130 merge 后，从 merge 后 spec/docs/wireframes 确认事实源迁移已经完成，再把收尾证据写入 roadmap。
4. 更新 `AGENTS.md` 的启动形态章节，使其显眼列出：
   - 默认不带 flag 的 local 行为；
   - GitHub-mode flag 的确切名字 `--github-mode`；
   - 运维启动用法 `pnpm start -- --github-mode`；
   - 带 flag 时进入纯 GitHub runner 行为；
   - local SQLite 数据与 GitHub issue/intake 状态互不可见、不镜像、不并存。
5. 更新 `docs/roadmap/milestone-4-local-console.md` 的 T7 段落，把 T7 勾选为 `[x]`，并追记默认 local、flag GitHub、两模式隔离、测试全绿、AGENTS.md diff 等验收证据。
6. 验证通过后提交、推送当前 #131 分支，并创建 PR；PR body 必须显眼列出 `--github-mode` 与 `pnpm start -- --github-mode`，同时包含 `Closes #131` 和 `Closes #128`。

## 影响

- 文档：`AGENTS.md`、`docs/roadmap/milestone-4-local-console.md`。
- OpenSpec：本 change 只新增最小 `local-console` delta，记录长期有效的运维启动文档契约；依赖门禁与 PR 关闭口径保留在 proposal / delivery evidence，不写入当前行为事实源。运行时事实由 #129，spec/wireframes 事实由 #130 承担。
- 交付流程：#131 的实现、commit、push、PR 创建被 #129/#130 merge 串行 gate 住。
- 对外运维口径：PR body 和 `AGENTS.md` 都会显眼列出 GitHub-mode flag 名与用法，供常驻 runner 合入后改启动命令。

## 验收语句

1. 检查 `AGENTS.md` 启动形态章节 → 应看到 GitHub-mode flag 的确切名字 `--github-mode`、用法 `pnpm start -- --github-mode`、默认 local 行为、带 flag 纯 GitHub 行为和两模式数据互不可见说明。
2. 检查 `docs/roadmap/milestone-4-local-console.md` 的 T7 段落 → 应看到 T7 已勾选 `[x]`，并追记默认 local、flag GitHub、两模式隔离、测试全绿和 `AGENTS.md` diff 等验收证据。
3. 检查最终 PR body → 应包含 `Closes #131`、`Closes #128`、验收证据摘要，以及显眼列出的 GitHub-mode flag 名 `--github-mode` 与用法 `pnpm start -- --github-mode`。

细化理由：第 1、3 条只把需求侧已确认的 flag 名和 PR Closes 口径填入原验收语句；第 2 条沿用原文，仅保留可机械检查的路径与证据项。
