# 设计：add-agent-prescript-workspaces

## 方案
实现分为四个新增/扩展点。

### agent manifest
新增 `src/agent-manifest.ts`，负责解析 agent Markdown 的 frontmatter 与正文：

- 支持 `preScript: src/agent-prescripts/<name>.ts`。
- frontmatter 外的 Markdown 继续作为 persona 输入 Codex。
- `preScript` 路径必须是相对路径，规范化后必须位于 `src/agent-prescripts/` 下，且不能包含 `..` 越界。

runner 不再只读取纯 Markdown 文本，而是读取 `AgentManifest`。无 frontmatter 的既有 agent 行为保持不变。

### pre script registry
新增 `src/agent-prescripts/index.ts` 与 `src/agent-prescripts/types.ts`：

- `types.ts` 定义 pre script 输入与输出。
- `index.ts` 是显式 registry，把 frontmatter 中允许的路径映射到具体函数，避免动态 import 任意文件。

pre script 输入包含：

- 当前 source issue：`owner`、`repo`、`issueNumber`、`issueKey`。
- 触发 role 与最新消息 index。
- 工作根目录配置。

pre script 输出包含：

- `ok: true` 与可选 `codexCwd`。
- 或 `ok: false` 与停止原因。失败时 runner 不调用 Codex、不发评论、不更新 role thread 状态。

### dev workspace pre script
新增 `src/agent-prescripts/dev-workspace.ts`。它只处理确定性环境准备，不处理 AI 需求本身。

状态保存在 `.state/agent-contexts.json`，按 `issueKey -> role` 记录：

```json
{
  "tranfu-labs/moebius#4": {
    "dev": {
      "preScript": "src/agent-prescripts/dev-workspace.ts",
      "owner": "tranfu-labs",
      "repo": "moebius",
      "issueNumber": 4,
      "worktreePath": "/.../moebius-workdir/worktrees/tranfu-labs__moebius__4__dev",
      "preparedFromMessageIndex": 0
    }
  }
}
```

首次处理：

1. 确保工作根目录存在。
2. 确保 bare cache repo 存在：`<WORKDIR_ROOT>/repos/<owner>__<repo>.git`。
3. cache 不存在时执行 `git clone --bare https://github.com/<owner>/<repo>.git <cachePath>`；cache 已存在时执行 `git --git-dir <cachePath> fetch --prune`。
4. 创建 issue 独占 worktree：`git --git-dir <cachePath> worktree add <worktreePath> HEAD`。
5. 检查 worktree 可访问后写入 `.state/agent-contexts.json`。
6. 返回 `codexCwd = worktreePath`。

后续同 issue + dev：

1. 读取已有 context。
2. 检查 `worktreePath` 仍存在且可访问。
3. 不重复 clone，不重复创建 worktree。
4. 返回 `codexCwd = worktreePath`。

若已记录 context 但 worktree 缺失，返回失败并停止本轮，避免自动重建覆盖未提交工作。后续可单独设计显式 reprepare 指令。

不同 source issue 即使属于同一个 repo，也创建独立 worktree；repo bare cache 可复用。

### Codex cwd 与配置
`src/codex.ts` 的 `run()` 接受 `cwd?: string`，并传给 `child_process.spawn`。普通 agent 不提供 `cwd` 时保持现状；`@dev` 由 pre script 返回 worktree cwd。

`src/config.ts` 增加：

- `WORKDIR_ROOT`：默认解析为仓库同级 `moebius-workdir`，可由 `MOEBIUS_WORKDIR_ROOT` 覆盖。
- `AGENT_CONTEXTS_STATE_PATH`：默认 `.state/agent-contexts.json`。

启动日志打印 `workdirRoot` 与 `agentContextsStatePath`。

## 权衡
不把 clone/worktree 写在 `agents/dev.md` 正文里，是因为 persona prompt 无法提供确定性的前置执行保证，也不适合作为状态更新边界。

不使用任意动态 import 执行 frontmatter 路径，是为了避免 Markdown 内容变成可执行路径注入点。frontmatter 只作为 registry key，代码仍通过静态映射决定可执行脚本。

不按 target repo 复用 `@dev` worktree，是因为需求工作以 source issue 为边界。两个 issue 即使指向同一 repo，也可能有不同未提交改动，必须隔离。

## 风险
首次 clone 或 worktree add 会触发外部 GitHub 访问。失败时必须停止本轮，不能继续让 Codex 在错误目录里处理需求。

worktree 被外部删除时，自动重建可能丢失操作者对当前上下文的判断，因此本 change 选择失败停止。

新增状态文件需要校验 shape，损坏时应安全失败，而不是静默复用不可信路径。
