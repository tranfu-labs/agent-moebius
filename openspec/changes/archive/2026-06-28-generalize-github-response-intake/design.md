# 设计：generalize-github-response-intake

## 方案
实现拆成三层，保持现有 conversation / trigger / Codex / role state 主干稳定。

### 1. 业务数据层：GitHub response intake
新增纯业务模块，例如 `src/github-response-intake.ts`。它不访问 GitHub、不读写文件，只处理数据结构与状态转换。

建议类型：

```ts
interface WatchedRepository {
  owner: string;
  repo: string;
}

interface IssueSource {
  owner: string;
  repo: string;
  issueNumber: number;
  issueKey: string;
  cloneUrl: string;
}

interface IssueSummary {
  owner: string;
  repo: string;
  issueNumber: number;
  updatedAt: string;
}

interface IntakeIssueState {
  updatedAt: string;
  mode: "idle" | "active";
  activeNoChangeCount: number;
  nextPollAt: string | null;
}
```

纯函数职责：

- 生成稳定 key：`repoKey = owner/repo`，`issueKey = owner/repo#number`，`cloneUrl = https://github.com/owner/repo.git`。
- 判断哪些 repository 到了闲时扫描时间：默认 5 分钟。
- 判断哪些 active issue 到了忙时检查时间：默认 1 分钟。
- 根据 repo scan 返回的 issue summaries，挑出 `updatedAt` 变化的 issue source。
- 根据具体 issue 处理结果更新状态：
  - `triggered-success`：记录最新 `updatedAt`，进入或保持 active，`activeNoChangeCount = 0`，`nextPollAt = now + 1min`。
  - `no-trigger`：记录最新 `updatedAt`；如果该 issue 原本是 idle，则保持 idle、不进入 active；如果原本已 active，则继续 active 并清零无变化计数。
  - `unchanged-active`：`activeNoChangeCount += 1`；小于 5 时继续 active，大于等于 5 时降级 idle。
  - `failed`：不推进 `updatedAt`，不清零重试条件。

业务层还需要限制 active issue 数量，例如默认 `MAX_ACTIVE_ISSUES = 20`。当超过上限时，优先保留最近有变化的 active issue，其余降级 idle，避免异常仓库造成请求膨胀。

首次接入策略：

- 对 repository scan 首次看到的历史 open issue，默认只建立 baseline，不立即处理，避免新配置仓库后对旧 mention 批量补评论。
- 若需要保持当前单 issue 立即处理能力，可通过配置 seed issue sources，把特定 issue 直接放入 active poll。

### 2. 外部交互层：GitHub client 与 intake state
调整 `src/github.ts` 为参数化 adapter，不再直接读取单例 owner/repo/issue：

- `listOpenIssueSummaries(repo, limit)`：调用 `gh issue list --repo owner/repo --state open --limit <N> --json number,updatedAt`。
- `fetchIssueWithComments(source)`：调用 `gh issue view <number> --repo owner/repo --json body,comments,updatedAt`。
- `postComment(source, body)`：调用 `gh issue comment <number> --repo owner/repo --body-file -`，评论正文仍通过 stdin 传入。

新增 `src/github-intake-state.ts` 或并入相邻 state adapter，负责读写 `.state/github-response-intake.json`。该模块只做 JSON shape 校验与原子写入，不做 active/idle 业务判断。

所有外部命令继续使用 `child_process.spawn(cmd, args[])`，不得拼接 shell。

### 3. Runner 编排层
`src/runner.ts` 拆成两个层级：

- `processIssueSource(source, issue, sharedContext)`：复用现有单 issue 流水线。它负责 timeline、trigger、preScript、Codex、postComment、role thread state。所有日志与状态 key 使用传入的 `source.issueKey`。
- `tick()`：作为调度器，加载 intake state，决定 due repo scans 与 due active issue polls，调用 GitHub adapter 取数据，再把需要处理的具体 issue 交给 `processIssueSource`。

处理流程：

1. 启动时日志打印 watched repositories、idle/active interval、scan limit、active issue 上限与 workdir root。
2. 每个 tick 先加载 agent 文件与 intake state。
3. 对 due repositories 执行 summary scan，只拉最近更新 open issue 小窗口。
4. 对 summary 中 `updatedAt` 变化且不是首次 baseline 的 issue，获取完整 issue 并处理。
5. 对 due active issues 获取完整 issue：
   - `updatedAt` 未变：只更新 active no-change counter，不跑 trigger。
   - `updatedAt` 变化：交给 `processIssueSource`。
6. `processIssueSource` 返回业务 outcome，调度器据此调用 intake 纯函数更新状态。active issue 出现 no-trigger 变化时仍保持 active，直到后续连续 5 次无变化才降级。
7. 保存 intake state。

Outcome 建议包括：

- `triggered-success`：已成功发表评论，或 hook comment 已成功发布。
- `no-trigger`：成功读取并判断最新消息无有效 trigger。
- `failed`：pre script、Codex、GitHub comment 或非 issue-not-found GitHub 读取失败。
- `issue-not-found`：记录 skip，可从 intake state 中移除或降级 idle。

## 权衡
不做 webhook，是为了暂时避免域名、部署入口、GitHub App/webhook secret 与公网可达性的复杂度；轮询仍能满足 3-4 个 repo 的早期使用。

不把多 repository 逻辑塞进现有 conversation/triggers，是因为这些模块已经是纯业务协议层，负责 speaker、mention、prompt 与 stage trigger；GitHub response intake 是 source discovery 与节奏控制，属于更外层的接入职责。

不让 active issue 无条件覆盖全部 repo scan，是为了 rate limit 可控：闲时按 repo 小窗口扫描，忙时只盯已知 active issue。

不在首次 repo baseline 时自动处理所有旧 issue，是为了避免新接入仓库后对历史 mention 批量产生 Codex 调用和 GitHub 评论。需要立即跟进的特定 issue 可以通过 seed issue 配置进入 active。

## 风险
GitHub `updatedAt` 是调度去重的关键。如果 GitHub 对某些变更更新时间语义不符合预期，可能导致漏扫或重复扫。实现时应把 `updatedAt` 与 issueKey 打进日志，便于追踪。

active issue 上限可能在极端繁忙时让部分 issue 回到 5 分钟扫描节奏。该行为必须可配置，并在日志中记录降级原因。

Codex 或评论持续失败会保留重试语义，可能在 active 状态下每分钟重试。实现需要结合 active 上限和日志，后续可再增加失败退避；本 change 先不引入复杂 backoff。
