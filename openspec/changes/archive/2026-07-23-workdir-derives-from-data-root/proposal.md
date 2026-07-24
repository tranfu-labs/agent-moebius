# 提案：workdir-derives-from-data-root

## 需求基线
本变更为基础设施 / 落盘路径不变式，无对应页面 PRD。事实源锚点为 `openspec/specs/desktop-shell/spec.md#数据根`（现有 Requirement，本次修改其中 workdir 相关条目）。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| （无 PRD） | 数据根 / 安装后文件布局 | PRD 缺口：`docs/product/` 无「用户数据都在 `~/.moebius`」的产品事实源；补齐落点建议为 `DEPLOY.md` 或安装说明，本次仅记录不新建 | 待定 |

只留指针，不复制事实源正文。

## 背景
安装态排查（在 Electron 38.8.6 / Node 22.22.0 真实运行时下模拟「全新安装首启」）确认：session、sqlite、附件、`.state/`、agents、logs、teams 的落盘默认值都已派生自数据根，安装后正确落在 `~/.moebius`。**唯一逃逸数据根的运行时写盘默认值是 `WORKDIR_ROOT`**——`src/config.ts` 里它默认取 `PROJECT_ROOT/../moebius-workdir`（源码目录旁），git worktree 因此会建到应用包 / 源码附近。

现状在桌面壳没出事，是因为桌面主进程在派生 runner 时**逐个注入** `MOEBIUS_WORKDIR_ROOT=<数据根>/workdir` 把默认值盖掉。这是「靠每个调用点记得注入环境变量」的兜底：任何未注入的入口（终端 `pnpm start`、未来新增入口、重构中漏传）都会让 workdir 逃逸。不变式「所有运行时落盘只能派生自数据根」在此处依赖调用方纪律，而非源头保证。

## 提案
把不变式收口到源头：**`WORKDIR_ROOT` 默认值本身派生自 `DATA_ROOT`**，使 workdir 落点与数据根强绑定、与调用方无关。

- `src/config.ts`：`WORKDIR_ROOT` 默认从 `PROJECT_ROOT/../moebius-workdir` 改为 `path.join(DATA_ROOT, "workdir")`。`MOEBIUS_WORKDIR_ROOT` 环境变量保留为显式覆盖。
- `desktop/src/main.ts`：删除派生 runner 时对 `MOEBIUS_WORKDIR_ROOT` 的注入（`MOEBIUS_DATA_ROOT` 注入保留），因其已冗余——workdir 会自动跟随注入的数据根。

**范围之外**（安装态排查已确认非阻碍或与打包无关）：provider 密钥 / `.env` / `config.local.toml` 种子（客户端不需要密钥，`.env` 仅 dev）；存量项目目录数据迁移（调试产物）；`server.ts` 的 `projectRoot` 参数改名（生产始终显式传数据根、无实际逃逸，见 design.md）。

## 影响
- **行为**：仅改变「未显式提供 workdir 时」的默认落点，从源码目录旁改为数据根内。桌面壳原本显式注入，最终落点不变（都是 `<数据根>/workdir`）；终端 / CLI 入口从「源码目录旁」修正为「数据根内」。
- **测试**：无测试断言 `MOEBIUS_WORKDIR_ROOT` 注入或 `moebius-workdir` 路径；构造 local console server 的测试均显式传 `workdirRoot`，不受默认值变更影响。
- **事实源**：修改 `openspec/specs/desktop-shell/spec.md#数据根` 第 71 条（「靠打包态 env 注入」→「默认值派生自数据根」）。
