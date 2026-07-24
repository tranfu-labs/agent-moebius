# 提案：github-mode-startup-flag

## 背景

当前 `pnpm start` 入口在 `src/runner.ts` 中同时装配两条运行链路：先启动 local console server，再创建 GitHub issue runner 并启动 heartbeat。M4 T7 已裁决这只是过渡态：默认必须进入 local 模式，只有显式 GitHub-mode flag 才进入纯 GitHub runner；两模式不得同进程并存，也不得共享或镜像运行时数据。

需求侧已确认：

- flag 名固定为 `--github-mode`。
- 固定用法为 `pnpm start -- --github-mode`。
- 不带 flag 的 `pnpm start` 默认进入 local console/local 模式。
- local 模式使用 local console/SQLite 数据链路；GitHub 模式继续使用 GitHub intake / role thread / goal ledger 相关 state。
- GitHub 模式不启动 local console server，不做 SQLite 会话写入。
- 文档范围最小：只更新 AGENTS.md 启动形态与现有 runtime 运行说明，不新增 README 或新操作手册。
- 正式验收清单包含原三条、需求侧已确认的四条 QA 增补，以及 roadmap 修订新增的干净环境 local 冷启动检查。

QA 已指出上一版方案的静态缺陷：方案文件不可复现、OpenSpec 校验不可复现、exact flag 与未知参数未定义、桌面 runner child 未具体说明、以及现有 `*-state.ts` 通过 `sqlitePathForLegacyStateFile()` 复用 `.state/local-console.sqlite`，导致“只是不启动 local console server”不足以证明 GitHub 与 local 数据隔离。本版方案直接修正这些点，并明确把 legacy shared store 中 GitHub runner state slice 的有界迁移列为本 change 的实施目标。

## 提案

1. **启动模式解析**
   - 新增 `RuntimeMode = "local" | "github"` 与 `GITHUB_MODE_FLAG = "--github-mode"`。
   - `[]` 解析为 local。
   - `["--github-mode"]` 解析为 github。
   - 未知参数、`--github-mode=1`、拼写错误如 `--githubmode`、重复 mode 参数均 fail fast，且不启动任一 runtime。
2. **互斥 runtime 装配**
   - `pnpm start` 缺省只启动 local console server / local runtime，不加载 GitHub intake、不创建 GitHub runner、不执行 issue scan、不调用 GitHub issue list/view。
   - `pnpm start -- --github-mode` 只启动 GitHub runner heartbeat，不启动 local console server，不创建 local runtime，不写 local session/message/cursor。
   - `start()` 返回统一 `StartedRuntime` 句柄，包含 `mode` 与 `close()`，让 local server 与 GitHub heartbeat 都能有界关闭。
3. **GitHub mode 状态隔离**
   - GitHub mode 继续使用 GitHub issue runner 语义，但必须把 GitHub intake、role thread、agent context、goal ledger 等 runtime state 放在 GitHub-mode 专属 state channel。
   - 不能再让 GitHub mode 通过 `sqlitePathForLegacyStateFile()` 把这些 GitHub runner state 写入 local console `.state/local-console.sqlite` 的 local session store。
   - GitHub runner state 统一写入 `.state/github-runner.sqlite`；legacy JSON 只作为一次性迁移输入，不再作为新写入目标。
   - 首次切到 GitHub-mode 专属 state channel 时，必须从当前共用 `.state/local-console.sqlite` 或 legacy JSON 中有界迁移 GitHub runner state slice：GitHub intake、role thread、agent context、goal ledger。不得迁移 local session/message/cursor/route/dead-letter/workspace-diff 等 local console 数据。
   - GitHub runner state 迁移失败或超时时，必须在扫描 GitHub issue 前可见失败，不得 silent rebaseline，不得推进 intake cursor，不得启动 local runtime。
4. **桌面 runner child**
   - 桌面主进程继续拥有唯一 local console server。
   - `desktop/src/runner-child.ts` 必须显式以 GitHub mode 调用 runner 入口，或由 supervisor fork 参数显式传入 `--github-mode`。
   - 不再依赖 `MOEBIUS_DISABLE_LOCAL_CONSOLE=1`；桌面 child 通过共享 launch 常量显式选择 GitHub mode。
5. **测试与验收 harness**
   - 增加启动 parser 测试，覆盖 exact flag、缺省、未知/拼写错误/重复参数 fail fast。
   - 增加无 flag startup harness：临时数据根 + fake GitHub issue list/view 一调用即失败，3 秒内进入 local runtime，GitHub intake load / issue scan / issue read 调用次数为 0。
   - 增加 GitHub-mode startup harness：local console server / local SQLite store 注入为抛错或永久挂起，GitHub heartbeat 仍按既有有界路径启动或返回可见失败，且 local session command 计数为 0。
   - 增加隔离 oracle：同一临时数据根先后写入 local session message 与 GitHub intake/role-thread/ledger 代表 state；local API 不暴露 GitHub state，GitHub runner state loader 不读取或镜像 local session message，且同一启动流程不会同时打开两条写入链路。
   - 增加桌面 child 装配测试，断言 runner child 显式 GitHub mode。
6. **事实源和 PR 描述**
   - 更新 AGENTS.md 与现有 runtime 运行说明，显眼写出 `--github-mode` 与 `pnpm start -- --github-mode`。
   - PR body 首屏显眼列出 flag 名、用法、默认 local 行为，以及完整八条正式验收语句的证据映射。

## 影响

受影响模块：

- `src/runner.ts`：启动模式解析、互斥装配、统一 close 句柄。
- `src/*-state.ts` / `src/sqlite-state.ts`：为 GitHub mode state 与 local console SQLite session store 建立可审计隔离边界。
- `desktop/src/runner-child.ts` / `desktop/src/main.ts`：显式 GitHub mode 装配。
- `tests/runner.test.ts`、`tests/sqlite-state.test.ts`、`tests/local-console.test.ts` 或新增 focused 测试：覆盖启动与隔离。
- `AGENTS.md` 与现有 runtime 运行说明：更新启动形态事实源。
- `openspec/specs/github-issue-runner/spec.md`、`openspec/specs/local-console/spec.md`、`openspec/specs/desktop-shell/spec.md`：归档后更新事实规格。

非目标：

- 不改 mention trigger、conversation normalization、CEO guardrail、goal ledger 业务规则、artifact publishing、issue worktree、scanner/dispatcher 语义。
- 不新增 README、独立操作手册或新示例文档。
- 不迁移 local console 历史会话数据、不做跨模式镜像；本 change 必须只对 GitHub runner 历史 state slice 做有界迁移，以避免拆分 state store 时丢 intake cursor、role thread、agent context 或 goal ledger。

## 验收语句

1. 不带 GitHub-mode flag 执行 pnpm start → 应进入 local console/local 模式，且无 GitHub issue 扫描或 gh issue 读取调用。
2. 带 GitHub-mode flag 执行 pnpm start → 应进入纯 GitHub runner 模式，且不启动 local console SQLite 会话写入链路。
3. 在两种模式各写入一条代表性运行数据 → 应看到 local SQLite 数据与 GitHub issue/intake 状态互不可见、不镜像、不并存。
4. 使用错误参数 `pnpm start -- --githubmode` 或 `pnpm start -- --github-mode=1` → 进程应在启动任何 runtime 前 fail fast 并输出可见错误。
5. 预置当前格式的 `.state/local-console.sqlite`，其中含 GitHub intake、role thread、agent context、goal ledger 代表记录和 local session 代表记录 → 首次以 GitHub mode 启动时，应只迁移/读取 GitHub runner state 到 GitHub-mode channel，local session 记录不可见且不被镜像。
6. 注入 GitHub-mode state 迁移失败或超时 → 系统应在扫描 GitHub issue 前有界失败并输出可见错误，不得 silent rebaseline、不得推进 intake cursor、不得启动 local runtime。
7. 迁移成功后再次以 GitHub mode 启动 → 不重复导入、不覆盖较新的 GitHub-mode state，且 state loader 读取 GitHub-mode channel 而非 local session tables。
8. 不配置任何 repository、不做 `gh auth` 的干净环境下，默认 `pnpm start` 冷启动 → 应正常启动且无报错。
