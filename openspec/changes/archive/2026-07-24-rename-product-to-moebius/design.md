# 设计：rename-product-to-moebius

## 方案

### 1. 建立单向命名映射

一次性统一四类命名：

- 人类可见品牌：`Moebius`
- 技术 slug 与协议命名空间：`moebius`
- workspace scope：`@moebius`
- 环境变量前缀：`MOEBIUS`

默认生产数据根固定为 `~/.moebius`。代码中的导出常量、函数名和测试 fixture 也使用新命名，避免只替换字符串而留下旧概念。

### 2. 按契约层处理

- 包与构建层：更新根包、workspace packages、内部依赖、过滤命令、lockfile、Electron app id/product metadata、CI 与 Compose。
- 运行层：更新默认数据根、环境变量、临时目录、日志前缀、release tag、稳定 key、attachment header。
- 协议层：更新 comment role/stage/CEO metadata 的生成、解析和清理逻辑；只接受新 namespace。
- 表现与资料层：更新界面文案、Storybook fixture、测试路径、Agent 素材、PRD、架构/协议/roadmap 文档、原型和 OpenSpec。
- 路径层：重命名仓库内带旧 slug 的归档目录；不重命名 worktree 根，也不修改 git remote。

### 3. 零残留校验

机械替换后按大小写、分隔符和命名形态扫描全部跟踪文件及跟踪路径。扫描必须为零结果，再运行契约定向测试和全量验证。

## 权衡

- 采用一次性破坏式切换，放弃旧目录、环境变量和协议的兼容读取。这样能满足“全部改名”的目标，也避免仓库长期携带两套品牌。
- 历史 OpenSpec 归档也统一改名，放弃归档文本对旧命名的逐字保真，以换取仓库当前内容零残留。
- 不修改 worktree 路径和 remote URL，因为它们不属于跟踪代码，且变更需要仓库级外部协调。

## 风险

- 已有用户数据默认不会从旧目录加载；发布前需要由产品另行决定是否提供人工迁移说明。
- 旧 GitHub 评论 metadata 不再被识别，可能影响仍在进行的历史 issue；这是已确认的不兼容边界。
- 新 Docker image、release tag 或外部仓库名若尚未建立，相关发布流程会在外部资源缺失时失败；验证只保证本仓库引用一致。
- 大规模机械替换可能遗漏生成文件或路径名；通过零残留扫描、lockfile 校验、全量测试、桌面构建和原型检查共同防守。
- 回滚需整体回退本 change 的提交，不能只恢复单个命名层，否则会造成协议和包依赖不一致。
