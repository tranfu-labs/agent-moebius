# 提案：externalize-local-config

## 背景
上一轮把 GitHub response intake 通用化后，默认白名单直接写在 `src/config.ts`。这会把本地运行环境的 repository 白名单带入仓库默认行为，也不适合二次修改：不同机器应能各自配置监听范围，而提交代码时默认不应监听任何 repository。

## 提案
把 repository 白名单从代码默认值移到本地配置文件 `config.local`。

- 代码默认 `watchRepositories = []`。
- 运行时读取项目根目录 `config.local`，不存在时使用默认空白名单。
- `config.local` 使用 TOML 格式，并加入 `.gitignore`，不提交。
- 当前需要监听的两个 repository 作为本地 `config.local` 内容：
  - `tranfu-labs/tranfu-agents-app`
  - `tranfu-labs/agent-moebius`
- 配置解析分层：TOML 文件读取是外部适配，解析后的 shape 校验是可测业务逻辑。

## 影响
- `src/config.ts` 从纯常量模块变成加载默认配置 + 本地覆盖配置的入口。
- 新增本地配置解析/校验模块与测试。
- `.gitignore` 增加 `config.local`。
- `AGENTS.md`、模块地图和 `github-issue-runner` spec 需要从“默认白名单包含两个 repo”改成“默认空白名单，使用本地 config.local 配置”。
