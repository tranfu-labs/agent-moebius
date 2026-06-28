# 设计：fix-toml-config-files-and-active-filter

## 方案
### 配置文件
文件分工：

- `config.toml`：提交到仓库的默认示例文件。内容以注释为主，不启用任何 repository。
- `config.local.toml`：本机覆盖文件，被 `.gitignore` 忽略，实际写入本机要监听的 repository。

加载顺序：

1. 读取 `config.toml`，不存在则使用默认空配置。
2. 读取 `config.local.toml`，不存在则使用空覆盖。
3. 用 local 覆盖默认配置；当前只有 `watchRepositories` 一个字段，因此 local 的列表覆盖默认列表。

`parseLocalConfig` 允许 `watchRepositories` 缺失，缺失时视为空数组，这样纯注释的 `config.toml` 是合法配置。

### active issue 白名单约束
`getDueActiveIssueSources` 增加 `repositories` 入参，只返回 repository 仍在当前白名单内的 active issue。

`enforceActiveIssueLimit` 同样增加 `repositories` 入参，只对当前白名单内的 active issues 计数和降级，避免旧 state 影响当前监听范围。

## 权衡
不把本机两个 repository 写进 `config.toml`，是为了保持仓库默认不监听任何外部 repository；真实监听范围属于本机配置。

不删除旧 `.state` 里的 active issues，只是在调度层按当前白名单过滤。这样重新把 repository 加回 `config.local.toml` 后，旧状态仍可继续复用。

## 风险
如果用户只改 `config.toml` 而不建 `config.local.toml`，配置也会生效；但仓库提交的 `config.toml` 默认只放注释，不应包含真实监听项。
