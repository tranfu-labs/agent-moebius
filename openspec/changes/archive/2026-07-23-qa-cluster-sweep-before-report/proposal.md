# 提案：qa-cluster-sweep-before-report

## 需求基线

本 change **不改动任何 PRD**——它调整的是 `@qa` 角色的执行方法论层面（一句检查规则的补充），不引入新的产品词汇、不动交接结构、不动 stage marker、不改成员职责边界。

| 文件 | 变更 | 状态 |
| --- | --- | --- |
| seeds/teams/development/members/qa/AGENT.md | 「检查方法」段追加一条「一类扫透再报」 | 本 change 新增 |
| seeds/teams/development/members/dev-manager/AGENT.md | 无改动 | — |
| seeds/teams/development/members/dev/AGENT.md | 无改动 | — |

> 产品意图零变更；这是**行为规格强化**，把一个原本只靠 qa 临场发挥的最佳实践变为默认规则。

## 背景：从一次真实 session 反推出「哪条改动 ROI 最高」

Session `local:2026-07-23T02:32:44.814Z-omeyxw` 里，用户一句「排查一下 Agents 列表页运行时间超级长」触发了一条完整的 dev-manager → dev → qa 交接链，总时长约 58 分钟、11 棒（后续续跑到 14 棒）。按角色累计耗时：

| 角色 | 耗时 | 占比 |
| --- | --- | --- |
| dev（写码 + 门禁） | 44 分 08 秒 | 63% |
| qa（复核 + 门禁） | 24 分 12 秒 | 34% |
| **dev-manager（编排/闸门）** | **2 分 07 秒** | **3%** |

**关键观察**：dev-manager 的调度层已经极致轻；提速的唯一大杠杆是压 dev/qa 之间的往返轮数。

qa 抓到的 4 个 blocking 全部集中在同一份 `server/routes/ingest.py`：

| 轮次 | 缺陷位置 | 类别 |
| --- | --- | --- |
| qa#1-a | ingest.py:86，`pending or DB` 未取较新时间 | 时间单调性 |
| qa#1-b | 状态变化前丢 pending；flush 竞争空窗 | 锁边界 / 状态固化 |
| qa#2-a | ingest.py:221，`recv` 生成在锁前；ingest.py:64 pending 写入直接覆盖 | 时间单调性 |
| qa#2-b | 后台 flush 循环缺 `try/except`，异常永久杀线程 | 异常边界 |

## 决定性证据：qa#2 的两个 blocking 在 qa#1 那版代码里**已经存在**

在目标仓库 `tranfu-agents-app` 上按 hash 反查：

- 提交 `9187896`（session 里 dev 汇报的 `3a65743`，rebase 后哈希变化）里，`_queue_heartbeat` 是 `_heartbeat_pending[int(event_id)] = last_seen`——**直接覆盖赋值**，没有取 max。这正是 qa#2-a 抓的 bug。
- 同一 commit 的 `_heartbeat_flush_loop` 是裸 `while True:` 直调 `flush_heartbeat_batch()`——**没有 `try/except`** 包裹。这正是 qa#2-b 抓的 bug。

结论：qa#2 的两个 blocking **不是 dev 修复 qa#1 时新引入的**，它们在 qa#1 那 8 分 16 秒复核期间就静静躺在同一份文件里，只是没被扫到。**中间那整轮 dev 返工（11 分 51 秒）+ 一次全量门禁在方法论上可以省掉**——约占全程 30%。

## 反证过程（本 change 显式收敛掉的其它方向）

上一轮讨论里挨个跑过的候选改法，按证据强度重排：

| 候选改法 | 是否落到本 change | 反证理由 |
| --- | --- | --- |
| qa 在方案阶段介入复核 | ❌ | 4 个 blocking 全在实现层（运算符 / 锁顺序 / except 遗漏），方案阶段代码尚不存在，qa 没有抓手；反而加一棒 |
| dev-manager 反思触发词加「实现前置约束维度」 | ❌ | 反思闸门运行在「方案 vs 用户目标」层。msg#68 dev-manager 已经列了 8 条约束、msg#69 dev 也 claim 全部实现——错的是「承诺了但代码写岔了」，反思闸门再细也咬不住实现层的手滑；那一层的守门人本就是 qa |
| dev 出厂自检清单左移到目标项目 AGENTS.md | ❌ | 无 session 证据支持「dev 有 checklist 就能自查出 `ingest.py:86` 的 `or` 用错」；那属于 code review 层判断，不是 checklist 能覆盖的 |
| dev 提交前只跑定向、省一遍全量门禁 | ❌ | 风险转嫁而非提速——把 dev 第一道自检门砍了，风险都压给 qa |
| **qa 抓到一类扫透再报（本 change）** | ✅ | 有决定性证据：4 个 blocking 全在同一份代码；不改棒次结构、不动其它 agent、不动目标项目文件；成本一句措辞 |
| qa「定向优先、全量兜底」写成默认策略 | 顺手并入本 change | 中等证据：qa#1（8:16）大部分是全量、qa#3（3:35）自发定向优先。每轮再压 3~5 分钟 |

## 提案

在 `seeds/teams/development/members/qa/AGENT.md`「检查方法」段，追加**一条**默认执行规则：

> 发现某一类缺陷（并发一致性、状态转移、失败恢复、时间聚合等）时，先在本改动涉及的文件与调用点里横向扫完这一类的**姐妹场景**（同一入口的其它写路径、同一依赖的其它使用点、同一后台任务的其它异常边界），把整批缺陷合并汇报。**不要抓到一个就报一个**——那会把本可以一轮讲完的问题拆成多轮返工。

同段第二条并入一句**「定向优先、全量兜底」**：先跑与本次改动相关的定向测试，绿了再决定要不要全量兜底；不给小改动配全量回归。

## 影响

- **github-issue-runner 域（qa 执行方法论，主）**：默认要求 qa 在同类缺陷上横向穷尽后合并汇报。
- **对 dev-manager 的「三轮不收敛熔断」不冲突**：本 change 是让 qa 一次讲更完整，不是取消轮数上限。
- **对 stage marker、mention 规则、workspace_access 边界**：不动。
- **可测性**：本 change 是执行方法论层面的规范，落地效果由后续 session 是否出现「同一份代码里同类缺陷被拆成多轮报」反证。
