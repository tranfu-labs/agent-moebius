# 提案：rename-product-to-moebius

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/prd.md` | 产品命名 | 确认 `Moebius` 为唯一产品品牌，并明确本次为不保留旧应用命名兼容的破坏式切换 | 已写入 |
| `docs/product/prd.md` | 运行环境与数据目录 | 将生产数据目录和环境覆盖入口统一到新的产品命名 | 已写入 |

## 背景

仓库中的品牌、包 scope、环境变量、数据目录、协议 metadata、HTTP header、临时目录、发布资源和文档仍混用一套旧项目标识。用户要求将仓库内受控命名彻底统一到 `Moebius` / `moebius`，并明确不保留旧名称兼容。

当前 worktree 路径和 GitHub remote 是外部仓库状态，不属于应用运行契约，本 change 不修改它们。

## 提案

- 用户可见品牌统一为 `Moebius`，技术标识统一为 `moebius`。
- workspace package scope 统一为 `@moebius/*`。
- 生产数据目录统一为 `~/.moebius`，环境变量统一为 `MOEBIUS_*`。
- GitHub comment metadata、阶段 marker、HTTP attachment capability header、稳定 key、日志前缀、临时目录、release tag、Docker image 与 Electron 标识全部切到 `moebius` 命名空间。
- 全部跟踪代码、测试、配置、脚本、文档、原型、当前规格与历史 OpenSpec 归档同步更新；仓库内带旧标识的文件或目录名同步重命名。
- 不读取旧目录、不接受旧环境变量、不解析旧协议标记、不保留旧 package alias。

## 影响

- 运行时：GitHub runner、local console、desktop shell、observer、Codex driver、媒体与编排链路。
- 构建与分发：pnpm workspace、lockfile、Electron build、CI、Docker Compose、release artifact。
- 对外契约：环境变量、默认数据根、comment metadata、HTTP header、稳定 key 与发布资源名称。
- 事实源：产品 PRD、OpenSpec 当前规格、架构/协议文档、Agent 素材和历史归档。
- 兼容性：已有旧目录数据不会被自动发现，旧环境变量和旧协议标记不再生效；调用方必须同步切换。
