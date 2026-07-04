# github-issue-runner spec delta

## 新增

- MUST 为每次 `gh` CLI 子进程调用设置显式单次调用超时；超时后 MUST 终止对应子进程并让调用 promise settle，MUST NOT 让任何单个 `gh` 子进程永久挂起 runner 心跳或 issue job。
- MUST 在调用方 `AbortSignal` 触发时终止正在执行的 `gh` CLI 子进程，并停止后续 retry / sleep。
- MUST 让 `gh` CLI timeout 类错误按 transient GitHub CLI 失败处理：只读拉取与幂等 reaction MAY 在 `GITHUB_CLI_RETRY_POLICY` 预算内重试；发布 GitHub 评论与 release upload 等可见写操作 MUST NOT 自动重试。
- MUST 让持续 GitHub CLI 失败最终经 issue intake 失败记账收敛：失败不推进 `updatedAt`，失败达 `FAILURE_RETRY_LIMIT` 后只有死信评论发布成功才折叠为 `dead-lettered`，处理恢复成功时 MUST 清零失败计数且 MUST NOT 发布死信。
- MUST 让 Codex run watchdog 覆盖子进程挂起场景：超过 `CODEX_RUN_MAX_DURATION_MS` 后 MUST abort 当前 Codex run；即使 driver promise 永不 settle，runner 也 MUST 先合成 timeout failure 让 issue job settle，记录 `event = "codex-watchdog-timeout"`，把该次处理判为携带 timeout reason 的 `failed`，并释放 in-flight issue 与 driver pool 名额。
- MUST 让 `src/codex.ts` adapter 在收到 abort 时终止底层 `codex` 子进程并返回 interrupted failure result，避免 driver pool 依赖永不返回的 job 自行释放名额。
- MUST 让 issue 输入媒体提取跳过 SVG URL；`.svg` 引用无论来自 Markdown image、Markdown link、HTML `src` 还是 bare URL，均 MUST NOT 进入传给 media-assets / Codex `--image` 的 issue media references。
- MUST 保留 output artifact 发布对 SVG 的支持；SVG 过滤仅适用于 issue 输入媒体引用，不适用于 Codex 生成产物发布。

## 场景新增

- 场景：GitHub CLI 子进程挂起不会无限等待
  Given runner 正在通过 GitHub adapter 执行一次只读 `gh` CLI 调用
  And 该 `gh` 子进程一直不退出
  When 单次调用 timeout 到期
  Then 系统终止该 `gh` 子进程
  And 本次尝试按 transient 失败进入有限 retry 或最终上抛
  And 对应心跳或 issue job 不会永久等待该子进程。

- 场景：持续 GitHub 网络故障最终死信或恢复
  Given 某 issue 的最新消息需要处理
  And fake GitHub adapter 持续抛出网络错误
  When runner 多轮处理该 issue
  Then 每轮失败都不推进该 issue 的 intake `updatedAt`
  And 心跳仍能继续扫描 / 派发其他 due issue
  And 失败达预算后，死信评论发布成功时该 issue 折叠为 `dead-lettered`
  And 若预算轮处理恢复成功，则正常 `triggered-success` 且不发布死信。

- 场景：Codex 子进程卡死时 watchdog 释放名额
  Given `dev` agent 的 Codex run 子进程不产生最终结果且不自行退出
  And fake driver promise 在收到 abort 后仍永不返回
  When 运行时长超过 `CODEX_RUN_MAX_DURATION_MS`
  Then watchdog abort 当前 Codex run 并记录 `codex-watchdog-timeout`
  And 该 issue processing outcome 为 `failed`
  And issue 从 in-flight 集合移除
  And driver pool 后续 queued job 能继续启动。

- 场景：SVG issue 输入引用被过滤
  Given issue timeline 中包含 `.svg` URL
  And URL 分别出现在 Markdown image、Markdown link、HTML `src` 与 bare URL 中
  When runner 提取本轮 issue media references
  Then 这些 SVG URL 均不会出现在提取结果中
  And 非 SVG 图片 / 视频 URL 仍按既有规则提取。
