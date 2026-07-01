# 设计：fix-reflector-stage-hook-dedup

## 方案

### 去重函数替换

`src/triggers/reflector-stage-trigger.ts`：

- 删除：
  ```ts
  function hasExistingStageHook(timeline, sourceRole, stage, sourceIndex): boolean
  ```
- 新增：
  ```ts
  function countExistingStageHooks(timeline, sourceRole, stage): number
  ```
  遍历 timeline 每条消息的 `parseStageHookMetadata`，累计 `hook.sourceRole === sourceRole && hook.stage === stage` 的数量（不再比对 `sourceIndex`）。

- 调用点（`resolveReflectorStageTrigger`）：
  ```ts
  import { MAX_SELF_REFLECT } from "../config.js";
  ...
  if (stage === null || countExistingStageHooks(timeline, latestMessage.speaker, stage) >= MAX_SELF_REFLECT) {
    return null;
  }
  ```

`stage-hook` 评论 body 仍然写入 `sourceIndex=<latestMessage.index>`——它**只用于人 / 日志追溯**，不再参与去重判定。`parseStageHookMetadata` 接口不变。

### timeline 边界

`timeline` 由 `processIssueSource` 通过 `buildTimeline` 在每个 issue 处理周期内构造，本身就是单个 issue 的 body + 全部 comments（[src/conversation.ts](../../../src/conversation.ts)）。同一 (sourceRole, stage) 的 hook 计数天然限定在「当前 issue」内，不会跨 issue 串扰，无需引入 issueKey 维度。

in-tick 自反循环里 `appendPostedComment` 把新 hook 追加到本地 timeline 副本，下一次 `resolveTrigger` 调用时计数会随之增长——in-tick 第 4 次循环时 hook 数=3=MAX，trigger 自然返回 skip。这也让 in-tick 与跨 tick 走同一个上限。

### 行为表（MAX_SELF_REFLECT=3）

| 时机 | dev 第 N 次发同 stage | 当前 hook 数 | trigger 结果 |
|---|---|---|---|
| in-tick / 跨 tick | 1 | 0 | post-comment → 数到 1 |
| in-tick / 跨 tick | 2 | 1 | post-comment → 数到 2 |
| in-tick / 跨 tick | 3 | 2 | post-comment → 数到 3 |
| in-tick / 跨 tick | ≥4 | ≥3 | skip → 闭环 |

### self-reflect.ts 的 max-iterations 分支

`decideNextSelfReflectStep` 的 `iteration > maxIterations` 分支会被 trigger 层先一步挡住（因为 hook 数=MAX 时 `resolveTrigger` 已返回 `skip`，进入 `stop:trigger-skip` 而非 `stop:max-iterations`）。

**保留它**作为防御层——若未来 trigger 去重出 bug，in-tick 自反仍有硬上限不会发散。代价：`stop:max-iterations` 分支的测试用例从"实际可达"变成"理论保留"，但已有测试构造的是直接喂 `post-comment` 结果，仍可触达，不需要改。

## 权衡

### 决策 1：用 `(sourceRole, stage)` 而非 `(sourceRole, stage, sourceIndex)`

候选方案对比：

- **A. 现状**（`(sourceRole, stage, sourceIndex)` 严格匹配）：每条消息独立去重 → issue #57 的发散。**否决**。
- **B. `(sourceRole, stage)` 一次性去重**：一个 stage 一辈子只触发 1 次。无法重入；dev 修方案后再发同 stage 不会再被反思。语义最简但失去重入余量。
- **C. `(sourceRole, stage)` + MAX_SELF_REFLECT 计数**（本方案）：保留有限重入，3 次允许"初次 + 2 次修正"。
- **D. 加 stage 间穿越状态机**：dev 切到 code-verified 后再回 plan-written 允许重新触发。实现复杂、测试集膨胀，超出 issue #57 的当前痛点。

选 C 的理由：
- 阈值复用 `MAX_SELF_REFLECT`，无新常量、in-tick / 跨 tick 用同一个上限，语义统一。
- 3 次足够覆盖"反思 → 改方案 → 再触发反思 → 再改"的真实迭代节奏。
- 一旦未来确实需要无限重入（如新增"plan-rewritten" 等显式新 stage），dev 直接用新 stage 名即可——本方案不阻塞。

### 决策 2：sourceIndex 留在 hook body 里但不参与去重

去掉 sourceIndex 会破坏现有 hook 评论格式与 `parseStageHookMetadata` 解析（虽然解析只在去重路径用，但日志、人审、未来扩展都依赖它）。**保留 metadata，不破坏格式**；只是判定不再使用。

### 决策 3：复用 timeline 自带的 per-issue 边界

不引入"issueKey 维度的状态文件"。timeline 由 runner 按 issueKey 构造，hook 是 timeline 上的 metadata，per-issue 隔离天然成立。新增持久化状态会带来过期清理 / 跨进程同步的复杂度，不划算。

## 风险

- **in-tick 与跨 tick 共用同一上限可能让 in-tick 自反不到 3 次就停**：例如外部 actor 先手动 post 过 2 条同 (role, stage) hook，dev 再发新 stage 时 in-tick 只剩 1 次额度。可接受——外部 actor 手 post 是边缘场景，且不会比之前更差（之前 hook 数=2 已经多触发了 2 次）。
- **回滚**：把 `countExistingStageHooks` 改回 `hasExistingStageHook(... sourceIndex)`，恢复测试旧用例即可。一文件级回退。
- **常量重命名**：本次**不重命名** `MAX_SELF_REFLECT`——名字仍能表达"反思次数上限"语义；改名涉及面太广（config / log fields / spec / 日志消费方），不在本 change 范围。
