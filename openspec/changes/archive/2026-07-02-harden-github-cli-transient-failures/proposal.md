# 提案：harden-github-cli-transient-failures

## 背景
GitHub 的 GraphQL/REST 接口会间歇性返回 `EOF`、5xx、超时、限流等瞬时错误。当前 `src/github.ts` 的 `runCommand` 对任何 `gh` 非 0 退出都立即失败、零重试，由此引出三个问题：

1. **收尾中断检查一抖就丢产出**：`processIssueSource` 在 codex 成功后还要做一次「收尾中断检查」（再拉一次 issue 看有没有人插话）。这一步撞上瞬时错误时被判 `failed`，已经完成的 codex 产出被整轮丢弃、评论不发。
2. **瞬时失败烧掉降级预算**：`failed` 会累加 `activeNoChangeCount`，累计到 `activeIssueNoChangeLimit` 就把 issue 降级 idle。于是 GitHub 抖几分钟，issue 就被「静默放弃」，看起来像卡住。
3. **无重试导致日志刷屏**：运行中中断监视器每 15s 拉一次，接口抖动时每次都失败刷 `agent-run-interrupt-check-failed`。

另外还有一个尚未触发但存在的死锁风险：`busy` 集合只在 job settle 时释放，若 codex run 永不返回，则该 issue 永久 `skip-inflight`。

## 提案
引入**两层重试 + 瞬时失败软降级**：

- **调用内同步重试（第 1 层）**：给 `gh` 调用套指数退避重试，只重试瞬时错误，确定性错误（issue 不存在 / 认证失败 / 参数非法）立即上抛不重试；支持 `AbortSignal` 取消。写操作（发评论）默认不自动重试以避免重复发帖；读操作与幂等的 reaction 可重试。
- **tick 间异步软失败（第 2 层）**：新增 `transient-failed` 处理结局。当第 1 层重试仍未成功（长时间断网），瞬时失败 MUST NOT 烧降级预算、MUST NOT 推进 `updatedAt`，保持 active 并排下一次 poll，让心跳在下一 tick 干净重入。
- **收尾中断检查 fail-open**：收尾检查因瞬时错误抛异常时，MUST NOT 判 `failed` 丢产出，而是假定无新消息、照常发布。
- **codex run 看门狗**：给单次 codex run 设总时长上限，超时中止并判 `failed`，兜底 `busy` 永占导致的死锁。

## 影响
- 受影响模块：`src/github.ts`（重试落点）、新增 `src/retry.ts`（重试原语 + `gh` 错误分类）、`src/github-response-intake.ts`（`transient-failed` 折叠）、`src/runner.ts`（fail-open + 失败分类 + 看门狗）、`src/config.ts`（重试策略与看门狗时长）。
- 对外行为：瞬时网络故障不再丢弃 codex 产出、不再把 issue 静默降级；确定性错误与业务失败仍按原 `failed` 路径收敛降级。
- 业务域：`github-issue-runner`。
