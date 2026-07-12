# 设计：local-console-t46-project-workspace-source

## 方案
本方案只扩展 local console / desktop shell / console-ui 三个本地域，不改 GitHub runner 的核心链路。GitHub issue worktree 的已有实现作为本地 worktree resolver 的 git 操作参考，但不把 GitHub clone/fetch 语义带入本地 project。

### 1. SQLite project model

新增 `projects` 表：

```sql
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  folder_path TEXT,
  worktree_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

调整 `sessions` 为带 project 引用完整性的表。SQLite 不能安全地用单条 `ALTER TABLE` 给旧列追加完整 FK / CHECK 约束，所以 migration 采用表重建：

```sql
CREATE TABLE sessions_next (
  session_id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  source_owner TEXT,
  source_repo TEXT,
  source_issue_number INTEGER,
  parent_session_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (source_type <> 'local' OR project_id IS NOT NULL)
);
```

迁移规则：

- SQLite worker 每次打开数据库后执行 `PRAGMA foreign_keys = ON`，保证 project FK 在写入路径生效。
- 初始化时先确保默认 project 存在，`project_id='local'`，`source_type='local-folder'`，`folder_path=<dataRoot/projectRoot>`，`title` 为目录名。
- 旧 local sessions 复制进 `sessions_next` 时 `project_id` 回填默认 project；消息、cursor、runDir、错误状态不迁移、不重写，仍通过原 `session_id` 关联。
- GitHub sessions 保持 `project_id=NULL`，通过 `CHECK (source_type <> 'local' OR project_id IS NOT NULL)` 避免影响 GitHub session key 和现有 runner 行为。
- `ensureSession` 接受可选 `projectId`；创建本地 session 时必须写入已存在的 project id，未传时落到默认 project；传入不存在 projectId 时在同一 transaction 内失败，不能写半条 session / message。
- `listSessions` 按 project_id 聚合，state API 返回 project 列表和选中 project 下的 sessions。
- 迁移完成后保留 `session_edges`、`session_messages`、`local_message_cursors` 等按 `session_id` 关联的事实，不改这些表的数据含义。

TypeScript 形态：

```ts
interface LocalConsoleProjectSummary {
  projectId: string;
  title: string;
  sourceType: "local-folder";
  folderPath: string;
  worktreeMode: boolean;
  worktreeUnavailableReason: string | null;
  sessions: LocalConsoleSessionSummary[];
  runningCount: number;
  waitingCount: number;
  stuckCount: number;
  errorCount: number;
}

interface LocalConsoleSessionSummary {
  sessionId: string;
  projectId: string;
  title: string;
  ...
}
```

`worktreeUnavailableReason` 是最近一次 workspace resolve 的可观察结果；对 worktree 关闭和 git worktree 成功为 `null`，对非 git 且 worktree 开启为 `not-git-repository`。

### 2. Workspace source adapter

引入本地 workspace source：

```ts
type WorkspaceSource =
  | { kind: "github"; cloneUrl: string }
  | { kind: "local-folder"; folderPath: string; worktreeMode: boolean };

type ResolvedWorkspace =
  | { cwd: string; mode: "direct"; reason: null }
  | { cwd: string; mode: "worktree"; worktreePath: string; reason: null }
  | { cwd: string; mode: "direct"; reason: "not-git-repository" };
```

T4.6 只在 local console 使用 `local-folder` source。`github` 分支作为类型层桥接，不接入 GitHub runner，也不改变 issue worktree 现状。

运行前解析：

1. store 根据 `sessionId` 读取 session 的 project source。
2. `LocalConsoleRuntime` 在 `runCodex` 前调用 `resolveLocalWorkspace`.
3. resolved cwd 传给 `runCodex({ cwd })`，替代当前固定 `this.options.projectRoot`。
4. resolved workspace 状态写入 active run snapshot，并在 store 中更新 project 最近 workspace status。
5. 如果 project 不存在、folderPath 不存在、folderPath 不可访问或 git/worktree 准备失败，runtime 走现有 local failure/stuck 记录路径，释放 session，不删除 project row，不丢 session timeline。

### 3. Git 目录与临时 worktree

git 判定：

- 使用 `git -C <folderPath> rev-parse --show-toplevel` 检测 repository root。
- folderPath 可位于 repo 子目录时，cwd 统一为 repo root；UI title 仍取用户选择目录名。若需要保留子目录 cwd，留到 T5，不在 T4.6 扩权。
- 非 git 目录检测失败时不报错、不初始化、不拒收。
- `rev-parse` 永久挂起、慢失败或异常 stderr 均必须经过 bounded child process wrapper 收敛为可见 local failure/stuck，并清理 active run。

worktree 开启：

- worktree root 使用数据根下的有界目录，例如 `<dataRoot>/workdir/local-worktrees/<safeProjectId>/<safeSessionId>`。
- 基于本地 `HEAD` 创建本地分支，例如 `agent-moebius/local/<safeProjectId>__<safeSessionId>`。
- 使用有界 git 调用：`git -C <repoRoot> worktree add -B <branch> <worktreePath> HEAD`。
- 已存在 worktree 时复用；复用前校验路径可访问且 `git -C <worktreePath> rev-parse --is-inside-work-tree` 成功。
- 已存在 path 但不是合法 worktree、branch 冲突、`worktree add` 超时或失败时，返回 deterministic local error；不删除用户原目录，不伪装成原地成功。
- 不 fetch remote，不调用 `gh`，不 merge/rebase，不删除用户原目录内容。

复用 `issue-worktree.ts` 的主体路径做法：

- 抽出或复用安全路径段、bounded child process timeout、git stderr 摘要、worktree 路径校验等工具，放到本地域可引用的 helper 中。
- 不复用 GitHub issue source 的 clone/fetch/main freshness 语义，因为本地 project 基于用户目录当前 `HEAD`。

worktree 关闭：

- resolved cwd 为 repo root。
- 不创建 worktree，不改分支。

非 git 且 worktree 开启：

- resolved cwd 为 `folderPath`。
- 写入 `worktreeUnavailableReason=not-git-repository`。
- UI 显示为“worktree 不可用，已原地运行”。
- 验收脚本断言目录没有新 `.git`。

### 4. Local console API

新增 / 扩展 HTTP API：

- `GET /api/local-console/state?projectId=&sessionId=`：返回 `projects`、`selectedProjectId`、`project`、`selectedSessionId`、当前 session timeline、active run、sqlitePath、lastError。
- `POST /api/local-console/projects`：body `{ folderPath, worktreeMode }`，创建或复用 project，返回 project；title 默认取 `path.basename(folderPath)`。
- `PATCH /api/local-console/projects/:projectId`：更新 `worktreeMode`；不改 folderPath。
- `POST /api/local-console/sessions`：body 可带 `{ projectId, title }`，默认使用 selected/default project。

兼容：

- 旧 `/api/local-console/messages` 和默认 session 继续可用，映射到默认 project。
- 旧 renderer 如果只读 `project` 字段仍能看到选中 project；新 renderer 使用 `projects` 展示列表。

### 5. Desktop shell and renderer

主进程 / preload：

- `preload.ts` 新增窄 IPC：`selectProjectFolder(): Promise<string | null>`，只返回用户选择的路径，不写配置、不启动 Codex。
- `main.ts` 使用 Electron `dialog.showOpenDialog({ properties: ["openDirectory"] })`。
- 仍保持 context isolation 和 node integration disabled。

renderer：

- “打开文件夹”按钮调用 preload 选择目录，再 POST `/api/local-console/projects`。
- project 行有 worktree 开关；切换后 PATCH project，并刷新 state。
- 新建会话默认挂到当前选中 project。
- 选择 project 时选中该 project 最新 session；若没有 session，提示创建会话。

console-ui：

- `OperatorConsoleProps` 增加 `projects`、`selectedProjectId`、`onOpenProject`、`onSelectProject`、`onToggleProjectWorktree`。
- 左栏从单 project heading 改为可折叠 / 分组的 project 列表，每个 project 下展示 sessions。
- project title 使用真实目录名；副文本展示 folderPath 尾部、worktree 开关和不可用原因。
- 继续保持近单色、紧凑操作台风格；不用营销型 hero 或解释性大段文本。

字符图见 `wireframes.md`。

### 6. 测试与验收

单元 / 集成测试：

- SQLite migration：默认 project 创建、旧 local sessions 回填 project_id、project list 重启一致、消息 / cursor / runDir / 错误状态不变。
- SQLite integrity：local session 的 `project_id` 必须引用存在 project；用不存在 projectId 创建 session 或发消息必须失败并且不写半条 session/message。
- project API：打开 folder 创建 project、重复打开同一路径复用 project、更新 worktreeMode。
- workspace resolver：
  - git + worktree on 创建 / 复用 worktree，cwd 指向 worktree。
  - git + worktree off cwd 指向原 repo root。
  - non-git + worktree on cwd 指向原目录并记录 `not-git-repository`。
  - fake git timeout / slow failure 返回可见 local failure/stuck，不永久占用 session，后续同 session 消息可继续。
  - folderPath 删除或改名时返回可见 local error，不删除 project row，不丢原 session timeline，其他 project/session 仍可运行。
- runtime：`runCodex` 收到 resolved cwd，不再收到固定 projectRoot。
- desktop：preload 暴露窄 IPC，main dialog 返回路径。
- console-ui：project list、真实 title、worktree switch、不可用原因可渲染。

验收脚本 `scripts/acceptance/local-console-t46.ts`：

1. 创建 git fixture，提交初始文件，打开 project 且 worktreeMode=true；fake Codex 在 `options.cwd` 写 marker，断言原目录 `git status --short` 为空、worktree status 有 marker。
2. 同一 git fixture 另开 project 或切换 worktreeMode=false；fake Codex 写 marker，断言原目录 `git status --short` 有 marker。
3. 创建非 git fixture，worktreeMode=true；fake Codex 写 marker，断言 cwd 是原目录、没有 `.git`、state 有 `not-git-repository`。
4. 关闭并重启 local console server，读取同一 SQLite，断言 projects 数量、projectId、title、folderPath、worktreeMode 与重启前一致。
5. 在 PATH 放 fake `gh` 记录器，脚本结束断言 project/workspace 路径调用次数为 0；脚本不启动 desktop env doctor，证据中显式说明排除范围，并用单元测试验证 folder picker IPC 本身不调用 `gh`。
6. 使用 fake `git` timeout / worktree add failure 验证 bounded failure/stuck、active run 释放与同 session 后续消息继续处理。
7. 使用旧版 SQLite fixture 和非法 projectId 写入路径验证 project FK / local-only 约束、旧 timeline/cursor/runDir/error 保留与非法引用原子失败。
8. 使用删除或改名 folderPath fixture 验证可见本地错误、project row / session timeline 保留与其他 project/session 继续运行。
9. 使用 fake `gh` PATH 与 folder picker IPC 静态断言验证 project/workspace 路径和文件夹选择入口不调用 `gh`；证据明确排除 desktop env doctor。

输出 `artifacts/acceptance/t46-evidence.json`，实现完成回复显式引用该 worktree 相对路径。

## 权衡
- 选择“非 git 原地跑”而不是自动 `git init`：不越权改变用户目录，且满足普通文件夹作为 project 的入口可用性。
- 选择“非 git 原地跑”而不是拒收：拒收会让“打开文件夹”入口在非代码目录上表现为失败，不符合 product-manager 对最小可用范围的拍板。
- 选择 session 级 worktree path：隔离粒度足够覆盖 T4.6 验收，且避免同一 project 多 session 互相污染；T5 再定义回流 / 回滚语义。
- 选择保留旧 `project` 字段同时新增 `projects`：降低 renderer/API 迁移风险，兼容 T4 已有消费者。
- 选择不改 GitHub runner：T4.6 目标是本地 workspace source，GitHub issue worktree 已有事实源和测试，混改会扩大回归面。

## 风险
- `sessions` 表重建需要保持旧数据和索引语义。缓解：在 transaction 内先创建默认 project，再复制 local/GitHub sessions，最后 rename；用 migration fixture 覆盖消息、cursor、runDir、错误状态不变。
- worktree 分支名或路径冲突可能导致创建失败。缓解：project/session id 进入安全路径段，已存在路径先校验复用，失败形成可见 local error。
- fake `gh` 零调用容易被 desktop env doctor 混淆。缓解：T4.6 验收限定 project/workspace 路径；desktop env doctor 的 `gh` 检查属于既有启动自检，不作为 project/workspace 零调用证据。
- 本地原 repo 有未提交改动时，worktree 从 `HEAD` 创建不会包含这些改动。缓解：T4.6 明确“基于本地 HEAD”；UI 可在后续显示提示，本轮不把未提交改动复制到 worktree。
- folderPath 被删除后 project 仍在 SQLite。缓解：resolve 时返回可见 failure，不删除 project；用户后续可重新打开目录，删除 project 管理不在本任务范围。
- worktree 资源清理未定义。缓解：T4.6 只保证隔离 cwd 和可验收状态，清理 / 回流 / rollback 归 T5。
