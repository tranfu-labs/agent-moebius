# 提案：fix-toml-config-files-and-active-filter

## 背景
上一轮把本地 repository 白名单外置为 TOML，但文件名仍是 `config.local`，不符合 TOML 文件应带 `.toml` 后缀的直觉。同时缺少一个可提交的 `config.toml` 示例文件，用户需要通过注释了解本地配置写法。

复盘还发现 active issue 轮询只读 `.state/github-response-intake.json`，没有和当前白名单求交集；如果历史 state 里有 active issue，即使删除本地配置，runner 仍可能继续轮询旧 issue。

## 提案
- 提交 `config.toml` 作为默认示例文件，只保留注释和 commented example，不实际监听任何 repository。
- 把本机覆盖文件改名为 `config.local.toml`，并在 `.gitignore` 中忽略。
- 运行时先读取 `config.toml`，再读取 `config.local.toml` 覆盖；两个文件都缺失或只有注释时，白名单为空。
- active issue 轮询和 active issue 上限裁剪都只作用于当前 watched repositories。

## 影响
- `src/local-config.ts`、`src/config.ts`、`.gitignore`、`config.toml`。
- `src/github-response-intake.ts` 的 active issue due 和 active 上限逻辑。
- 补充 local config 与 intake 单元测试。
- 更新 AGENTS、模块地图、OpenSpec 事实规格。
