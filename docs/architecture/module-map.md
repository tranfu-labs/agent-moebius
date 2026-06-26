# 模块地图

当前仓库还没有 TypeScript 源码目录，运行时模块以下列待实现边界记录；已有真实目录 `agents/` 作为素材模块记录。

### agents
- 职责边界：存放 agent/用户画像类 Markdown 素材；不负责 GitHub 轮询、状态记录或本地脚本执行。
- 入口：`agents/product-manager.md`、`agents/hermes-user.md`
- 上游：TODO: 需人工确认（当前没有代码引用这些素材）
- 下游：无运行时依赖。
- 禁止依赖：MUST NOT 依赖运行时状态文件、GitHub token 或本地脚本输出。

### github-issue-runner（待实现）
- 职责边界：常驻运行，按配置轮询 GitHub Issue 来源，识别新增 issue，并把待处理 issue 交给本地脚本执行模块；不负责业务脚本的具体逻辑。
- 入口：TODO: 需人工确认（当前仓库无 `src/`、`package.json` 或 CLI 入口）
- 上游：进程启动命令或部署方式，TODO: 需人工确认。
- 下游：GitHub API、issue 去重状态、本地脚本执行模块。
- 禁止依赖：MUST NOT 依赖 `agents/` 作为运行状态；MUST NOT 直接拼接 issue 内容为 shell 命令。

### local-script-executor（待实现）
- 职责边界：以受控方式调用用户配置的本地脚本，并把 issue 数据作为参数、stdin 或环境变量传入；不负责轮询 GitHub 或判断 issue 是否已处理。
- 入口：TODO: 需人工确认
- 上游：`github-issue-runner`
- 下游：本地脚本路径、进程执行 API。
- 禁止依赖：MUST NOT 执行来自 issue body 的任意命令；MUST NOT 在日志中输出敏感配置。

### issue-state-store（待实现）
- 职责边界：记录已发现或已处理的 issue 标识，支撑去重和重启恢复；不负责调用 GitHub API 或执行本地脚本。
- 入口：TODO: 需人工确认
- 上游：`github-issue-runner`
- 下游：TODO: 需人工确认（文件、SQLite 或其他持久化方式尚未确定）
- 禁止依赖：MUST NOT 存储 GitHub token；MUST NOT 把本地脚本输出当作唯一去重依据。
