# 提案：add-agent-prescript-workspaces

## 背景
当前 runner 只把 `agents/*.md` 当作 persona 文本传给 Codex。`agents/dev.md` 需要在 Codex 执行前准备目标仓库工作目录：同一个被扫描的 GitHub issue 第一次触发 `@dev` 时创建该 issue 独占 worktree，后续同 issue 的 `@dev` 继续在这个 worktree 中 resume。

这类动作不适合只写在 agent Markdown 正文里交给 AI 自己执行。clone、worktree、权限检查、Codex cwd 都是 runner 的确定性前置动作，必须通过受控代码完成，并保持 shell-free 的外部命令调用约束。

## 提案
引入 agent pre script 机制与 `dev` 工作目录准备脚本：

- agent Markdown 可通过 frontmatter 声明 `preScript`，路径必须指向仓库内 `src/agent-prescripts/`。
- runner 在选中 agent 后、构造 Codex prompt 前执行该 agent 的 pre script。
- `@dev` 的 pre script 基于当前 runner 正在处理的 GitHub issue source，而不是解析 issue body/comment 中的链接。
- `@dev` 第一次处理某个 source issue 时，在可配置工作根目录下准备该 issue 独占 worktree。
- 同一个 source issue 后续再次触发 `@dev` 时复用已记录 worktree，不重复执行 clone/worktree 创建。
- Codex 运行时显式使用 pre script 返回的 `cwd`。
- 启动日志打印解析后的默认工作根目录，默认值为仓库同级的 `agent-moebius-workdir`，可通过环境变量覆盖。

## 影响
- `agents/dev.md` 增加 frontmatter，成为人类和代码定位 pre script 的唯一入口。
- 新增 agent pre script 适配层与 dev workspace 状态文件。
- `src/codex.ts` 需要支持传入 `cwd`。
- `src/runner.ts` 仍负责编排，但 pre script 细节下沉到独立模块。
- `openspec/specs/github-issue-runner/spec.md`、`docs/architecture/module-map.md`、`AGENTS.md` 需要反映新的运行时边界。
