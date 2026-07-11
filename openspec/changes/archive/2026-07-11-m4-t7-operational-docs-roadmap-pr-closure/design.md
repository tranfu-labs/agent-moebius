# 设计：m4-t7-operational-docs-roadmap-pr-closure

## 方案

本 change 分为两个阶段执行。

### 阶段一：方案并行

当前只落盘本 OpenSpec change，不触碰目标文档，不提交、不推送、不创建 PR。这样 #131 可以先接受方案审查，同时不引用 #129/#130 尚未 merge 的实现事实。

### 阶段二：merge 后收尾

等 #129 与 #130 都 merge 后执行：

1. 同步最新 `origin/main` 到 #131 工作分支，并检查 #129/#130 的 merge 后事实：
   - `pnpm start -- --github-mode` 确实是 GitHub-mode 启动方式；
   - 默认 `pnpm start` 指向 local 模式；
   - spec/wireframes 事实源迁移已经反映在 merge 后文件中。
2. 修改 `AGENTS.md` 的“常用命令 / 运行常驻脚本”相关启动形态说明，突出运维必须使用的 GitHub-mode flag：
   - `--github-mode`
   - `pnpm start -- --github-mode`
3. 修改 `docs/roadmap/milestone-4-local-console.md` 的 T7 段落：
   - `### - [ ] T7 ...` 改为 `### - [x] T7 ...`
   - 添加收尾验收证据段，列出默认 local、flag GitHub、两模式隔离、测试全绿、AGENTS.md diff 和 PR 收口证据。
4. 执行验证：
   - 文档检查：`rg -n -- '--github-mode|pnpm start -- --github-mode|默认 local|纯 GitHub|互不可见|不镜像|不并存' AGENTS.md docs/roadmap/milestone-4-local-console.md`
   - 回归检查：`pnpm test`、`pnpm typecheck`、`git diff --check`
   - 依 #129/#130 的最终实现状态，必要时补跑它们在 PR 中列出的相关验收命令。
5. 提交、推送并开 PR：
   - commit message 包含本收尾范围；
   - PR body 同时包含 `Closes #131` 与 `Closes #128`；
   - PR body 单独设置显眼小节列出 `--github-mode` 与 `pnpm start -- --github-mode`；
   - PR body 汇总验收证据。

## 权衡

选择先写方案、后等依赖 merge 再实现，是为了满足需求侧的串并裁决：方案阶段可以并行提高吞吐，但 AGENTS.md 和 roadmap 不能引用未落地的 runtime flag 或迁移后事实源。

本 change 只新增最小 `local-console` delta。它记录运营收尾文档契约与依赖门禁，不定义或实现启动模式行为；#129 仍是运行时事实源，#130 仍是 spec/wireframes 事实源。

不提前修改 `AGENTS.md` 或 roadmap。原因是 #129/#130 还未 merge 时，任何目标文档修改都可能在依赖落地后失真，且需求侧明确禁止实现、commit、push、PR 在依赖 merge 前执行。

## 风险

- 风险：#129 最终合入的 flag 细节与当前裁决不一致。
  - 处理：阶段二先以 merge 后事实校验；如偏离 `--github-mode` / `pnpm start -- --github-mode`，停止并请需求侧裁决，不擅自改口径。
- 风险：#130 迁移后的目标域或文件结构与当前预期不一致。
  - 处理：roadmap 证据引用 merge 后真实文件，不沿用方案阶段猜测。
- 风险：测试耗时或环境依赖导致全量回归失败。
  - 处理：记录失败命令与原因；不创建 PR，直到失败被修复或需求侧明确调整验收口径。
