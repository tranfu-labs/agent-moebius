# 任务：workdir-derives-from-data-root

- [x] `src/config.ts`：`WORKDIR_ROOT` 默认改为 `path.join(DATA_ROOT, "workdir")`，保留 `AGENT_MOEBIUS_WORKDIR_ROOT` 覆盖（并入纯函数 `resolveRuntimePaths`，成为单一事实源）
- [x] `desktop/src/main.ts`：删除派生 runner 时的 `AGENT_MOEBIUS_WORKDIR_ROOT` 注入，保留 `AGENT_MOEBIUS_DATA_ROOT`
- [x] 加/改单测：新增 `tests/config-runtime-paths.test.ts`（4 例，正例数据根与仓库根分叉 + 旧逃逸值回归守卫）；更新 `tests/local-config.test.ts` 两处 `resolveRuntimePaths` 期望补入 `workdirRoot`
- [x] 跑 `pnpm typecheck`（root + desktop + console-ui）全绿；`pnpm test` 中与本改动相关的用例全绿（残留 2 个为满并发负载超时 flaky，隔离跑通过，与本改动无关）
- [x] 复跑安装态模拟脚本，确认「仅注入 DATA_ROOT」的入口下 `workdirRoot` 落在数据根内（修复前逃逸至 `/Users/wing/Develop/agent-moebius-workdir`，修复后为 `<数据根>/workdir`）
