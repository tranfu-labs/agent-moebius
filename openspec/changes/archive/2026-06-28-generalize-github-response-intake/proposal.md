# 提案：generalize-github-response-intake

## 背景
当前 `github-issue-runner` 的 GitHub 响应入口仍以单个固定 issue 为中心：`src/config.ts` 写死一个 owner/repo/issue，`src/github.ts` 直接读取该全局配置，`src/runner.ts` 每轮只处理这一条 source issue。

接下来需要支持 3-4 个 repository 的 GitHub issue 响应，但暂不引入 webhook。直接每分钟扫描所有仓库 issue 容易浪费 GitHub API/CLI 请求，也会把运行时编排和外部交互耦合得更重。更合理的形态是新增一层 GitHub 响应接入层，在保持既有单 issue 处理流水线的基础上，负责发现哪些 issue 需要被交给 runner 处理。

## 提案
新增 GitHub response intake 层，把“哪些 repo/issue 该扫、哪些 issue 进入忙时、何时降级、哪些变化已处理”从 runner 编排中抽离出来。

核心行为：

- 默认闲时每 5 分钟扫描每个配置 repository 的最近更新 open issues 小窗口。
- 当某个 issue 出现 runner 相关变化并成功处理后，将该 issue 标记为 active，后续按 1 分钟检查该 issue。
- active issue 连续 5 次 1 分钟检查没有新变化后，降级回 idle。
- idle repo scan 只做 repository issue summary discovery；active issue poll 只检查具体 issue，不反复扫描全 repo。
- issue 没有有效 trigger 时记录其最新更新时间，但不进入 active。
- Codex、pre script 或 GitHub comment 失败时不推进该 issue 的已处理更新时间，保留重试语义。

架构上分成两层：

- 业务数据层：纯函数处理 repository/issue key、调度状态、active/idle 状态转换、due decision 和处理结果归档。
- 外部交互层：`gh` CLI 读取 issue summary / issue details / 发表评论，以及 `.state` JSON 文件读写。

## 影响
- `github-issue-runner` 的运行形态从单一固定 issue 扩展为多 repository 轮询 + per-issue active polling。
- `src/runner.ts` 需要拆出“处理一个 issue source”的可复用流程，并由 intake 调度器喂入多个 source。
- `src/github.ts` 需要从全局固定 issue client 改为接收 repository/issue source 参数的 adapter。
- 新增本地忽略状态文件，用于保存 GitHub response intake 的扫描与 active issue 状态。
- 行为规格、模块地图与 AGENTS 需要反映新的接入层边界。
