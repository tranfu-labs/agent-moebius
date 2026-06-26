# agent-moebius · AI 项目操作手册

## 项目概览
本项目目标是一个 Node.js + TypeScript 常驻脚本：运行后定期扫描指定 GitHub Issue 来源，发现新增 issue 时执行本地脚本，例如把 issue body 交给本地脚本处理。当前仓库还没有 `package.json`、`tsconfig.json` 或运行时代码，只有角色素材与本次初始化生成的协作文档。

## 项目结构
```text
.
├── agents/
│   ├── hermes-user.md          # Hermes 用户画像素材
│   └── product-manager.md      # 产品经理 agent 角色素材
├── docs/
│   ├── adr/                    # 架构决策记录
│   ├── architecture/           # 模块地图
│   └── wireframes/             # 初始化默认生成的线框图事实源
├── openspec/
│   ├── changes/                # 先设计再实现的变更工作区
│   └── specs/                  # 当前行为事实规格
└── LICENSE
```

## 常用命令
当前仓库尚未定义可验证命令：没有 `package.json`、Makefile 或 justfile。

- 安装：TODO: 需人工确认（新增 TypeScript 工程后补齐）
- 运行常驻脚本：TODO: 需人工确认
- 构建：TODO: 需人工确认
- 测试：TODO: 需人工确认
- lint/格式化：TODO: 需人工确认

## 编码规范
当前仓库尚未提供 `.editorconfig`、ESLint、Prettier 或 TypeScript 配置。新增运行时代码时应先补齐：

- TypeScript 编译配置与 Node.js 运行方式。
- GitHub token、目标仓库/查询条件、轮询间隔、本地脚本路径等配置入口。
- lint、格式化、测试脚本，且写入 `package.json` scripts 后再更新本节。
- 本地脚本执行必须把 GitHub issue 内容当作数据处理，不能拼接成 shell 命令。

## 修改前检查
- 读 `docs/architecture/module-map.md` 确认依赖边界。
- 读相关 `openspec/specs/<domain>/spec.md`。
- MUST 确认改动 NEVER 引入 module-map 中被禁的依赖方向；若必须破坏，先写一条 ADR 记录再改。

## 修改后检查
- 跑测试 / lint / 构建，三者全绿（退出码 0）方可提交；任一失败 → 先修复，NEVER 带红提交。
- 更新受影响的 spec 与 ADR。
- 必要时在 `openspec/changes/` 记录变更。

## 禁止事项
- MUST NOT 提交 GitHub token、个人访问令牌、本地绝对路径、执行日志中的敏感内容或 `.env` 文件。
- MUST NOT 把 issue title/body/author 等外部输入直接拼接到 shell 命令中执行。
- MUST NOT 在没有去重状态的情况下对同一个 issue 重复触发本地脚本。
- MUST NOT 编造尚未存在的运行命令；新增脚本后同步更新本文件、模块地图和相关 OpenSpec。
- 当前 `agents/` 是角色素材，不应被运行时代码隐式改写或当作状态存储目录。

## 线框图
本项目默认生成 `docs/wireframes/`（字符图线框，用于对齐页面信息架构与版式）。它是**版式事实源**，与 `openspec/specs/`（行为事实源）并列，靠 `openspec/changes/` 流转更新——改页面的 change 在 `changes/<id>/wireframes.md` 画字符图，归档时回流到这里。归档约定见 `openspec/changes/AGENTS.md` 的「归档」一节。
是否保留按下面规则判断：
- 若本项目确定为**无界面**的工具 / 库 / CLI / SDK 类（如纯 npm 工具包），删除整个 `docs/wireframes/` 目录，并删除本节。
- 若有界面，按 `docs/wireframes/AGENTS.md` 的约定，为每个真实路由在 `docs/wireframes/pages/` 下补一页。
