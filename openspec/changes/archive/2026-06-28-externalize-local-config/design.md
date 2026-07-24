# 设计：externalize-local-config

## 方案
使用 TOML 作为本地配置格式，文件名为项目根目录下的 `config.local`。

示例：

```toml
[[watchRepositories]]
owner = "tranfu-labs"
repo = "tranfu-agents-app"

[[watchRepositories]]
owner = "tranfu-labs"
repo = "moebius"
```

### 配置模块
新增 `src/local-config.ts`：

- `DEFAULT_LOCAL_CONFIG`：默认 `watchRepositories = []`。
- `parseLocalConfig(raw)`：使用 TOML parser 把字符串解析成 unknown，再校验成运行配置。
- `loadLocalConfig(filePath)`：读取 `config.local`；文件不存在返回默认配置；TOML 解析失败或 shape 不合法时 fail fast。

`src/config.ts`：

- 保留轮询参数、状态路径、Codex 参数等代码默认值。
- `WATCH_REPOSITORIES` 改为 `loadLocalConfig().watchRepositories`。
- `CONFIG_LOG_FIELDS` 增加 `localConfigPath`，并打印实际解析出的 watched repositories。

因为 `config.ts` 当前通过同步常量导出被 runner 使用，本 change 选择同步读取 `config.local`，避免把整个启动路径改成 async。

### 本地配置文件与忽略规则
新增或修改：

- `.gitignore` 加 `config.local`。
- 在工作区创建本机 `config.local`，但因为它被忽略，不进入 commit。

### 依赖选择
使用 TOML 解析库处理语法，不手写字符串 parser。业务层只校验解析后的数据结构：

- `watchRepositories` 必须是数组。
- 每项必须包含非空 `owner` 与 `repo` 字符串。
- 不允许空 owner/repo。

## 权衡
选择 TOML 而不是 YAML，是因为当前配置主要是机器本地参数与 repository 列表，TOML 对这类结构更直接，避免 YAML 的隐式类型和缩进歧义。

同步读取 `config.local` 会让配置在进程生命周期内固定。常驻进程如果需要应用本地配置变化，重启即可；本 change 不引入热加载。

不提交示例 `config.local`，是为了保持“本地覆盖文件不进仓库”的约定。配置示例写在 AGENTS 与 spec 中。

## 风险
`config.local` 格式错误会导致启动失败。这是有意 fail fast，避免 runner 在错误配置下悄悄不监听或监听错 repository。

新增 TOML 解析依赖会更新 lockfile；需要通过测试与 typecheck 验证 ESM/TypeScript 兼容性。
