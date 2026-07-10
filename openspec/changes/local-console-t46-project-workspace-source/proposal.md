# 提案：local-console-t46-project-workspace-source

## 背景
T4 已经把桌面操作台升级为可订阅本地通道的主窗口，T4.5 又打通了本地多角色接力循环。但本地模式仍只有逻辑上的单一 project：

- `LocalConsoleRuntime` 调 Codex 时把 cwd 固定为 `runtime.options.projectRoot`，本地会话不能绑定到用户选择的真实代码目录。
- SQLite `sessions` 表没有 project 外键，`OperatorProject` 只是单项目占位，重启后不能恢复用户打开过的 project 列表。
- 桌面壳没有“打开文件夹”入口，也没有 worktree 开关。
- 本地模式还没有与 GitHub issue worktree 对等的 workspace source adapter，T5 要求的隔离 / 回滚语义无法建立在真实 project source 上。

产品已拍板非 git 目录策略：原地跑，不自动 `git init`，不拒收；如果 `worktreeMode=true` 但目录不是 git repository，runtime/UI 确定性降级为原目录 cwd，并记录 `worktreeUnavailableReason=not-git-repository`。

## 提案
本 change 按 T4.6 做一个数据正确级垂直切片：

1. 在 `.state/local-console.sqlite` 增加 `projects` 表，并通过 SQLite 外键 / local-only 非空约束把 `sessions.project_id` 指向有效 project；历史 local session 归入默认 project，GitHub session 保持现有行为不漂移。
2. 把本地 workspace source 明确建模为 `{ folderPath, worktreeMode }`，GitHub source 继续由现有 issue source / `cloneUrl` 表达，不改变 GitHub runner 对外行为。
3. 新增 workspace cwd resolver：local session 运行 Codex 前从 session 的 project source 解析 cwd。
   - git 目录 + worktree 开启：基于本地 `HEAD` 创建或复用临时 worktree，并把 Codex cwd 指向该 worktree。
   - git 目录 + worktree 关闭：Codex cwd 指向原目录。
   - 非 git 目录：Codex cwd 指向原目录；若开了 worktree，记录 `worktreeUnavailableReason=not-git-repository`。
4. 桌面壳新增“打开文件夹”入口和 project worktree 开关，通过 preload IPC 打开系统文件夹选择器，再调用 local console API 持久化 project。
5. `OperatorProject` 从占位升级为真实 project 数据；UI 展示 project 列表、真实目录名、worktree 开关状态和不可用原因。
6. 增加单元测试与 T4.6 验收脚本，覆盖 worktree 隔离、关闭开关原地改、非 git 降级、重启恢复 project 列表、fake `gh` 零调用；实现测试额外覆盖 project 外键/非法引用、bounded git 故障、folderPath 丢失等鲁棒路径。
7. 实现完成后把 T4.6 验收证据追记到 `docs/roadmap/milestone-4-local-console.md` 并勾选。

## 影响
受影响模块：

- `src/local-console/runtime.ts`：运行 Codex 前按 session project 解析 cwd，并把 workspace 状态暴露到 run snapshot / state。
- `src/local-console/store.ts` / `types.ts`：扩展 project、workspace source 和 session project 外键的读写接口。
- `src/sqlite-state.ts` / `sqlite-state-worker.ts`：新增 `projects` schema、session migration、project CRUD / list 命令。
- `src/local-console/server.ts`：新增 project API；创建 session 和 state API 支持 project 维度。
- `desktop/src/main.ts` / `preload.ts` / `console-page/app.tsx`：新增文件夹选择 IPC、打开 project、切换 project、worktree 开关。
- `packages/console-ui/src/console/operator-console.tsx`：左侧栏从单 project 展示升级为 project 列表 + project 下 sessions。
- `tests/local-console.test.ts`、`desktop/tests/*`、`packages/console-ui` 测试：补 project persistence、cwd resolver、UI props 和 IPC 行为。
- `scripts/acceptance/local-console-t46.ts`：新增可发布的 T4.6 验收证据。
- `docs/roadmap/milestone-4-local-console.md`：实现完成后追记证据并勾选 T4.6。

对外行为：

- 本地模式：用户可以打开多个本地文件夹作为 project，每个 session 归属一个 project；Codex 在该 project 的 workspace cwd 运行。
- 本地模式：开启 worktree 时，git project 的 Codex 修改落在临时 worktree，不污染原目录；关闭时直接在原目录运行。
- 本地模式：非 git project 始终可用，开 worktree 时降级原地跑，并可见不可用原因。
- GitHub 模式：不改 issue intake、comment/reaction、artifact、issue worktree、driver pool 或现有 GitHub 用户可见语义。

## 验收语句
1. 打开一个 git 目录且开启 worktree 开关 → 发送会让 dev 写文件的本地消息 → 应看到 Codex cwd 为临时 worktree、临时 worktree 有改动、原目录 `git status --short` 为空。
2. 打开同一个 git 目录且关闭 worktree 开关 → 发送会让 dev 写文件的本地消息 → 应看到 Codex cwd 为原目录、原目录 `git status --short` 显示该改动。
3. 打开非 git 目录且开启 worktree 开关 → 发送会让 dev 写文件的本地消息 → 应看到不初始化 git、不拒收、不调用 `gh`、Codex cwd 为原目录，并可观察到 `worktreeUnavailableReason=not-git-repository`。
4. 重启桌面壳或 local console server → 打开操作台 project 列表 → 应看到 project 列表与重启前一致，且 `OperatorProject.title` 等于真实目录名。
5. 跑 `pnpm exec tsx scripts/acceptance/local-console-t46.ts` → 应输出/记录 fake `gh` 调用次数为 0。
6. 用 fake `git` 让 `rev-parse` 或 `worktree add` 永久挂起 → 系统应在配置超时内记录可见 failed/stuck，active run 清空，同一 session 再发一条消息应能继续处理。
7. 用旧版 SQLite fixture 含 local sessions、messages、cursor、runDir、错误状态 → 启动迁移后应看到每个 local session 的 `project_id` 引用已存在 project，消息、cursor、status、runDir 不变；用不存在 projectId 创建 session 应失败且不写半条消息。
8. 创建 project 后删除或改名 folderPath 再发消息 → 系统应在超时内给出可见本地错误，不删除 project row，不丢原 session timeline，其他 project/session 仍可运行。
9. 在 fake `gh` 置于 PATH 的环境跑打开文件夹、project create、worktree on/off、非 git 降级流程 → 应看到 project/workspace 路径没有任何 `gh` 调用；若排除桌面 env doctor，证据必须显式说明排除范围，并单独验证 folder picker IPC 不调用 `gh`。

细化说明：第 3 条按 product-manager 拍板细化了非 git 场景，把原“走细化时拍板的处理路径”落为“原地跑 + 记录不可用原因”；第 6-9 条来自 QA 测试设计建议，已由 product-manager 明确接受并正式并入 T4.6 后续实现验收清单；其余 4 条沿用 issue 原文验收目标，仅把可观察证据机械化为 cwd、`git status --short`、project title 和 fake `gh` 计数。
