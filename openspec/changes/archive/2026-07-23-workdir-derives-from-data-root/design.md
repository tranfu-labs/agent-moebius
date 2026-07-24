# 设计：workdir-derives-from-data-root

## 方案
数据根解析有两层，均已存在，本次不新增机制：
1. 桌面壳 `desktop/src/data-root.ts::resolveDesktopDataRoot`：打包态 → `~/.moebius`，dev → 仓库根，`MOEBIUS_DATA_ROOT` 覆盖。
2. runtime `src/config.ts::resolveRuntimePaths`：读 `MOEBIUS_DATA_ROOT`，缺省回退代码目录。所有落盘常量挂在 `DATA_ROOT` 上。

改动只在于让 `WORKDIR_ROOT` 加入「挂在 `DATA_ROOT` 上」的行列：

```
// src/config.ts
export const WORKDIR_ROOT = path.resolve(
  process.env.MOEBIUS_WORKDIR_ROOT ?? path.join(DATA_ROOT, "workdir"),
);
```

桌面壳派生 runner 的 env 从 `{ MOEBIUS_DATA_ROOT, MOEBIUS_WORKDIR_ROOT }` 收敛为 `{ MOEBIUS_DATA_ROOT }`。runner 子进程 cwd 仍为数据根，`WORKDIR_ROOT` 经由注入的 `MOEBIUS_DATA_ROOT` 自动解析为 `<数据根>/workdir`，与原显式注入等价。

**串联链路**：桌面 → 注入 `MOEBIUS_DATA_ROOT` → 子进程 config.ts 算出 `DATA_ROOT` → `WORKDIR_ROOT = <DATA_ROOT>/workdir` → runner.ts / local-console 消费。终端 `pnpm start`：`DATA_ROOT` = 仓库根 → `WORKDIR_ROOT` = `<仓库根>/workdir`（原为 `<仓库根>/../moebius-workdir`，本次修正为数据根内）。

## 权衡
- **收口到 config.ts 默认值，而非继续靠 env 注入**：单一事实源，落点与调用方解耦；代价是终端模式 workdir 落点变化（`../moebius-workdir` → `<数据根>/workdir`），但这正是要修正的逃逸，且终端模式 workdir 为可重建的运行时缓存，无迁移负担。
- **不改 `server.ts` 的 `projectRoot` 参数名**：该参数语义实为数据根，是命名陷阱而非行为缺陷——生产调用方（`main.ts`）始终显式传 `status.dataRoot`，session/.state/workdir 落点正确。改名波及 `src/local-console/runtime.ts`（`this.options.projectRoot`）与 8 个构造 server 的测试，收益仅命名清晰、无安装收益。按比例原则本次不改，留作后续清理。
- **保留 `MOEBIUS_WORKDIR_ROOT` 覆盖**：仍允许把 worktree 显式放到别处（如独立磁盘），只是不再作为防逃逸的必需机制。

## 风险
- 低。改动为两处：一行默认值 + 删一行 env 注入。桌面壳最终落点不变；终端模式落点变化不涉及持久事实（workdir 是 git worktree 缓存，可重建）。
- 回滚：还原 `src/config.ts` 默认值与 `desktop/src/main.ts` env 注入两行即可。
- 验证靠单测 + 复用安装态模拟脚本（对照「仅 DATA_ROOT」入口，确认 `workdirRoot` 落在数据根内）。
