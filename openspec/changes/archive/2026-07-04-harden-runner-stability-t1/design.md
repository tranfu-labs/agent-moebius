# 设计：harden-runner-stability-t1

## 方案

### 1. GitHub CLI 单次调用有界

`src/github.ts` 的 `runCommand` 保持唯一 gh adapter 落点，在 spawn 层增加每次尝试的 timeout / abort 处理：

- 每个 child process 都绑定一个本地 `AbortController` 语义：调用方传入的 `signal` 或内部 timeout 任一触发时，先 `SIGTERM` 结束 `gh`，短暂宽限后仍未退出再 `SIGKILL`。
- 超时错误以 `CommandFailedError` 或专门的 timeout reason 上抛，`classifyGhError` 继续把 timeout 类错误判为 `transient`，由 `withRetry` 做有限次数重试。
- `postComment` 与 release upload 继续 `retry: false`，只获得单次调用 timeout，不做自动重发。
- 测试不等待真实长超时：通过 fake `gh` 脚本 + 可注入短 timeout 或 fake timer 验证 child 会被终止、promise 会 settle。

这里不新增跨进程全局熔断器。T1 的"连续失败后冷却"由现有两层有限机制承担：单次 gh 调用内 finite retry；issue 处理层 `failureCount` / `nextPollAt` / `FAILURE_RETRY_LIMIT` / dead-letter 收敛。这样不引入新的全局状态，也不破坏模块地图中 github adapter 与 intake 状态机的边界。

### 2. gh 持续失败故障注入

补充 runner / intake 测试覆盖 fake adapter 持续抛 GitHub 网络错误：

- 一轮处理失败后 `updatedAt` 不推进，`failureCount` 增加，`nextPollAt` 排到 active poll 后，心跳函数本身完成返回。
- 失败计数到预算轮时，runner 先做真实处理尝试；仍失败则发无 agent mention 的死信评论；死信发布成功才折叠 `dead-lettered`。
- 预算轮若处理恢复成功，则不发死信，正常 `triggered-success` 并清零失败计数。

现有 dead-letter 测试已覆盖部分行为，本次会补足"持续 fake gh 网络故障"与"心跳不等待 job 永久阻塞"的可机械验收。

### 3. Codex 卡死 watchdog 与 driver pool 释放

现有 `src/runner.ts` 已用 `CODEX_RUN_MAX_DURATION_MS` abort 正在运行的 Codex run，并把 timeout 与用户新评论 interrupt 区分。初始实现阶段先补测试；后续 loop watcher 授权最小触碰 `src/runner.ts` 后，runner 以 timeout race 兜底 fake driver promise 永不 settle 的验收路径：

- 使用 fake timer 推进 watchdog；
- fake `runCodex` 完全不 resolve，收到 `AbortSignal` 只记录 abort reason；
- runner watchdog 超时后先 abort 当前 driver，再合成 interrupted timeout result，让 `processIssueSource` 走既有 watchdog failed outcome；
- 通过 `createRunner` + 限流 driver pool 再提交后续 job，断言 timeout job settle 后后续 job 能启动，证明名额释放；
- `src/codex.ts` adapter 仍单独覆盖真实子进程忽略 `SIGINT` / `SIGTERM` 后升级 `SIGKILL` 并 settle 的路径。

该 runner 改动只包住两处 `runCodex` await，不改变扫描、轮询、dead-letter、CEO 或 driver-pool 职责。driver pool 仍只负责 job settle 后释放名额，不引入 GitHub / Codex issue 语义。

### 4. SVG issue 输入过滤正规化

`src/issue-media.ts` 的输入媒体提取继续在纯函数层过滤 `.svg` URL。测试更新为：

- Markdown image: `![diagram](https://example.test/a.svg)` 不返回；
- Markdown link: `[diagram](https://example.test/a.svg)` 不返回；
- HTML image/source: `<img src="https://example.test/a.svg">` 不返回；
- bare URL: `https://example.test/a.svg` 不返回；
- PNG/JPEG/WebP/视频与 GitHub user attachment URL 仍正常返回。

`src/media-assets.ts` 的 output artifact SVG 发布能力不在本任务移除；T1 只处理 Codex 输入媒体过滤，避免再次把 SVG 作为 `--image` 传给 Codex。

### 5. OpenSpec 归档与里程碑证据

实现完成后执行项目归档纪律：

- 合并本 change 的 spec-delta 到 `openspec/specs/github-issue-runner/spec.md`；
- 移动本 change 到 `openspec/changes/archive/<date>-harden-runner-stability-t1/`；
- 运行 `rg -n "svg" tests/` 与 `git log --oneline -- src/issue-media.ts`，把输出摘要作为 T1 验收证据；
- 运行 `pnpm test` 与 `pnpm typecheck`，把退出码 / 输出摘要追记到 `docs/roadmap/milestone-2-stability-oracle.md` T1 下并勾选。

## 权衡

- 不做全局 GitHub circuit breaker：全局熔断需要共享状态、半开探测与跨 repo 策略，超出 T1 列明模块；现有 issue-level retry/dead-letter 已能防无限重试和静默卡死。
- 不自动重试写评论：这保留当前安全边界，避免 `gh issue comment` 超时但服务端实际写入后又重发导致重复评论。
- 最小触碰 `src/runner.ts`：T1 初始范围未列该文件；验收测试证明现有 runner 无法覆盖 fake driver promise 永不 settle 后，已按 loop watcher 授权只增加 watchdog timeout race，不做其它编排重构。

## 风险

- gh timeout 的默认时长若过短，会误杀慢请求；若过长，故障收敛慢。实现时应选保守默认，并让测试用短 timeout 注入，避免把生产默认绑到测试速度。
- 子进程忽略 `SIGTERM` 时必须升级到 `SIGKILL`，否则 timeout promise 仍可能不 settle。
- fake driver 永不响应 signal 时，driver pool 无法自己释放名额；runner watchdog timeout race 负责让 issue job 有界 settle，`src/codex.ts` adapter 测试负责证明真实子进程会被强杀并 settle。
- `tests/issue-media.test.ts` 当前仍包含 SVG 被提取的旧期望；实现时必须改成过滤期望，并补齐多语法场景，避免 hotfix 再次被测试回退。
