# desktop-shell delta：workdir-derives-from-data-root

本 delta 修改 `openspec/specs/desktop-shell/spec.md` 的 `### 数据根` 小节：把原「靠打包态注入 `MOEBIUS_WORKDIR_ROOT` 防止 workdir 逃逸」的条目，替换为「`WORKDIR_ROOT` 默认值本身派生自数据根」。合并时以本节整体替换同名 `### 数据根` 小节，NEVER 与旧版并存；其余未列条目保持原样。

### 数据根
- MUST 打包态数据根默认为 `~/.moebius`，开发态默认为仓库根；`MOEBIUS_DATA_ROOT` 环境变量为最高优先级覆盖。
- MUST 把 runner 子进程工作目录设为数据根，使 `.state/` 等相对路径状态文件落在数据根下。
- MUST 让 `WORKDIR_ROOT` 默认派生自数据根（`<数据根>/workdir`），NEVER 以应用包或源码目录为基准。防止 workdir 落在应用包 / 源码附近 MUST 由该默认值本身保证，NEVER 依赖各入口逐个注入环境变量；`MOEBIUS_WORKDIR_ROOT` 仅作显式覆盖（如放到独立磁盘）。
- MUST 首启把 `agents/`（含 `ceo-scripts/`）与示例 `config.toml` 种子拷贝到数据根；已存在的文件 NEVER 覆盖。
- MUST 保持 `src/config.ts` 在未设置数据根环境变量时行为与终端形态完全一致，且此时 `WORKDIR_ROOT` 落在（作为数据根的）仓库根下。
