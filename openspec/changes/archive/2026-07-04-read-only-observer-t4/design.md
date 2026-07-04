# 设计：read-only-observer-t4

## 方案

### 1. 独立入口与模块边界
新增 `src/observer/`，与 runner 主链路并列：

- `src/observer/read-state.ts`：只读 tolerant reader。它读取项目根目录下的本地配置和状态文件，把每个输入源归一为 `ok` / `missing` / `error` / `partial` 结果；坏 JSONL 行逐条记录诊断并跳过，不抛出到 HTTP server 顶层。
- `src/observer/model.ts`：纯聚合逻辑。输入白名单 repository、intake state、role threads、agent contexts 与 run manifests，输出可渲染观察模型。只展示白名单 repo 内的 issue；issue 来源来自 intake、role thread、agent context 和 manifest 的并集。
- `src/observer/render.ts`：无副作用 HTML renderer。输出一页静态 HTML，包含 repo 列表、诊断区域、issue 详情和 run artifact 区域。
- `src/observer/server.ts`：轻量 Node HTTP server。`pnpm observer` 运行 `tsx src/observer/server.ts`；默认监听 `127.0.0.1:8787`，可用 `OBSERVER_PORT` 覆盖。每次请求重新读取文件；不 watch 文件、不写文件、不调用 GitHub。

模块依赖方向：

- observer 可以复用 `src/local-config.ts` 的 TOML shape 解析和 `src/issue-source.ts` 的 issue key helper。
- observer 不 import `src/runner.ts`、`src/github.ts`、`src/codex.ts`、`src/state-persister.ts`、`src/issue-dispatcher.ts` 或任何写状态 helper。
- observer 直接用 Node `fs/promises` 读取文件；所有写路径在代码审查中应不存在。

### 2. 本地配置读取
读取顺序与 runner 口径一致：提交版 `config.toml` 是默认值，存在 `config.local.toml` 时由本机覆盖。

与 runner 不同的是，observer 对配置读取 fail-open：

- `config.toml` 缺失或损坏：诊断区显示读取失败；若没有可用 local config，白名单为空。
- `config.local.toml` 缺失：显示 missing 诊断但不视为错误，继续使用 `config.toml`。
- `config.local.toml` 存在但损坏：诊断区显示读取失败，白名单使用空列表，避免误展示非白名单 issue。

### 3. 状态与 manifest 解析
状态文件输入：

- `.state/github-response-intake.json`
- `.state/role-threads.json`
- `.state/agent-contexts.json`
- `.state/run-manifests.jsonl`

读取规则：

- 文件缺失返回 `missing`，页面显示该源暂无记录。
- JSON 文件存在但解析失败或 shape 不符合预期，返回 `error`，页面显示读取失败；其他源继续渲染。
- run manifest JSONL 逐行解析。空行忽略；坏 JSON、缺必填字段、issue / artifact 字段 shape 不合法的行被跳过并记录行号诊断；其余行继续参与聚合。
- artifact `publishedUrl` 允许为 `null`；`stage` 允许 T3 契约里的 `plan-written`、`code-verified`、`in-progress`、`unknown`。

### 4. 聚合模型
repo 维度只来自白名单配置。每个 repo 下的 issue 来源合并：

- intake issue state 的 `owner` / `repo` / `issueNumber`
- role thread store 的 issue key，如 `owner/repo#50`
- agent context store 的 issue key，如 `owner/repo#50`
- run manifest record 的 `issue.owner` / `issue.repo` / `issue.number`

聚合结果不发明新的生命周期状态。每个 issue 显示来源标注：

- `intake`：`mode`、`updatedAt`、`nextPollAt`、`failureCount`、`lastFailureReason`
- `role threads`：每个 role 的 `lastSeenIndex`，以及是否有 thread id（thread id 只显示截断值，避免页面过宽）
- `agent contexts`：每个 role 的 `preScript`、`preparedFromMessageIndex` 与 `worktreePath`
- `run manifests`：按 `completedAt` 倒序列出每轮 run，最新一轮的 `stage` 作为“最新 run stage”

白名单 repo 如果没有任何 issue 记录，repo 区域显示“没有记录”。某个源读取失败时，诊断区显示“读取失败”，且 repo 空态仍显示为“没有记录”或“有记录但部分来源不可用”，避免把坏文件误判为系统空闲。

### 5. Artifact 展示
run artifact 渲染规则：

- `publishedUrl` 为非空字符串时展示链接。
- `publishedUrl` 看起来是图片 URL（路径扩展名为 `.png` / `.jpg` / `.jpeg` / `.gif` / `.webp` / `.svg`，忽略 query）时内嵌只读预览；预览失败由浏览器自身显示 broken image，不影响页面。
- `publishedUrl = null` 时展示“未发布”和 manifest 中的 staged `path`；不通过 observer server 暴露本地文件内容。
- artifact path 按纯文本渲染并 HTML escape，不作为本地文件读取入口。

### 6. 页面与交互
页面为只读单页：

- 左侧或顶部展示白名单 repo 与 issue 锚点列表。
- 右侧或下方展示诊断和 issue 详情；点击 issue 锚点只跳转到同页锚点，不触发任何写操作。
- 不提供按钮、重跑、ack、刷新状态、发布 artifact 等控制功能；刷新浏览器页面即可重新读取本地文件。

见 `wireframes.md`。

### 7. 测试与验证
单元测试：

- 白名单 repo 空态显示“没有记录”。
- 非白名单 repo 的 intake / manifest / role thread / context 记录被忽略。
- `.state` JSON 文件缺失时页面继续渲染。
- `.state` JSON 文件损坏时显示“读取失败”，其他源继续渲染。
- JSONL 单行损坏或缺字段时跳过该行并记录行号诊断。
- JSONL 尾行半截 JSON 且无换行时跳过尾行，保留此前完整 run。
- 配置文件损坏时显示配置读取失败，不能把白名单解析失败误报为所有 repo“没有记录”。
- 多来源合并同一 issue，来源标签正确。
- manifest artifact 已发布 URL 渲染为链接，图片 URL 渲染为预览。
- manifest artifact `publishedUrl = null` 显示“未发布”和 staged path。
- 页面同时出现“没有记录”和“读取失败”时文案可区分。

AI 验证流程：

1. 准备临时 `.state` 与 `config.local.toml`，包含至少一个白名单 issue、一个带图片 `publishedUrl` 的 manifest record、一个坏 JSONL 行和一个无记录白名单 repo。
2. 运行 `pnpm observer`，打开本地页面。
3. 检查白名单 issue 列表、阶段来源、artifact 预览 / 链接、坏行诊断、无记录 repo 空态。
4. 删除 `.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/run-manifests.jsonl`，刷新页面，确认返回 200、白名单 repo 显示“没有记录”、诊断区显示 missing 且不是读取失败。
5. 准备损坏 state JSON、合法 JSONL 行、坏 JSONL 行、缺 `issue` 或 `artifacts` 字段的 JSONL 行，刷新页面，确认合法记录保留且诊断区指出文件 / 行号 / 缺字段。
6. 准备最后一行只有半截 JSON 且无换行的 manifest，刷新页面，确认跳过尾行并保留此前完整 run。
7. 对 fixture 目录记录文件列表和内容哈希，启动 observer、刷新三次、查看 artifact 区域、停止 observer，确认 `config*`、`.state/*.json`、`.state/run-manifests.jsonl` 与 artifact / release 目录无新增、无修改。
8. 在 `PATH` 前置会记录调用并失败的 fake `gh` 与 fake `codex`，启动观察页并刷新，确认页面可用且 fake 调用日志为空。
9. 启动 observer 后执行 `kill -9 <observer-pid>`，随后运行一轮 runner heartbeat 验证或对应 fake runner 测试，确认 runner 在时限内完成、日志无 observer 相关错误、issue intake 状态无回滚。
10. 准备损坏的 `config.local.toml`，打开观察页，确认显示配置读取失败诊断，不把白名单解析失败误报成所有 repo“没有记录”。

常规验证：

- `pnpm test`
- `pnpm typecheck`
- `git diff --check`

## 权衡
- 选择 `src/observer/` 而不是 `scripts/observer/`：observer 是长期本地入口，TypeScript 模块和测试与运行时代码同级更利于维护；同时通过依赖边界保证它不进入 runner 主链路。
- 不使用前端框架或构建工具：v0 是本地只读诊断页，Node server + server-side HTML 足够，避免引入打包和 asset pipeline。
- 不通过 observer server 读取或代理本地 artifact 文件：减少本地文件暴露面；T3 的发布链接才是可查看 artifact 的主路径，未发布 artifact 只展示路径。
- 不把状态 reader 复用现有 strict loader：现有 loader 面向 runner，损坏状态应抛错；observer 的目标是诊断，必须把坏文件展示出来而不是崩溃。

## 风险
- 状态文件 shape 未来变化可能导致 observer 把新字段忽略。缓解：reader 只依赖必要字段，未知字段透传无害；缺必填字段显示诊断。
- 页面展示 thread id / worktreePath 可能过宽。缓解：thread id 截断展示，完整值放 `title`；路径使用可换行样式。
- `publishedUrl` 图片识别只基于 URL 扩展名，某些 GitHub asset URL 可能没有图片扩展名。缓解：无扩展时仍展示链接；后续如有真实需求再在不调用 GitHub的前提下补 manifest MIME 字段。
- observer 解析配置 fail-open 可能无法展示白名单。缓解：诊断区明确显示配置读取失败，避免误判为系统没有 issue。
