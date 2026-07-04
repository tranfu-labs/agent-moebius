# 提案：read-only-observer-t4

## 背景
里程碑 2 T4 需要一个本地只读观察页，让排查者不用手动翻 `.state/*.json`、`.state/run-manifests.jsonl` 和日志，就能看到白名单 issue 当前处于什么阶段、最近一轮 Codex run 产生了什么证据、artifact 是否已经发布。

T3 已经落成 run manifest 契约：每轮完成的 Codex run 会在 `.state/run-manifests.jsonl` 中追加 issue、role、stage、artifact path / publishedUrl 和时间字段。T4 在此基础上只消费本地事实源，不新增控制能力，也不改变 runner 主链路。

## 提案
新增独立观察页入口 `src/observer/` 与 `pnpm observer` 命令：

- 只读读取 `config.toml` / `config.local.toml`、`.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/run-manifests.jsonl`。
- 按白名单 repository 展示 issue 列表；白名单 repo 本地没有 issue 记录时显示“没有记录”，读取失败时显示“读取失败”，两者明确区分。
- 对每个 issue 聚合展示事实源状态：intake mode / failure、role thread `lastSeenIndex`、agent context worktree 信息，以及最新 run manifest stage；不新增业务状态机。
- 展示每轮 run 的 artifact：优先展示 `publishedUrl`，图片 URL 内嵌预览；只有 staged path 且 `publishedUrl = null` 时显示“未发布”和只读路径。
- 观察页 HTTP 进程与 runner 零耦合：不 import runner、不调用 GitHub、不写 `.state` / manifest / release / release asset，不提供操作按钮；浏览器刷新时重新读取本地文件。
- 对缺失 `.state` 文件、损坏 JSON、坏 JSONL 行或缺字段 manifest 行 fail-open：页面继续启动并显示诊断。

## 影响
- 新增 `src/observer/` 独立入口与对应单元测试。
- `package.json` 增加 `observer` 脚本，`AGENTS.md` 补运行命令与只读边界。
- `openspec/specs/github-issue-runner/spec.md` 归档时补充 observer v0 行为规则与场景。
- 不改 `src/runner.ts` 主链路，不改 GitHub / Codex adapter，不新增写状态路径。
