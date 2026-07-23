# 设计：orphan-run-surfaces-as-stuck

## 方案

### 判定时机：启动 catch-up

现有 spec 已有 `MUST continue startup catch-up from the next unprocessed local trigger after restart`。在同一启动 catch-up 路径上增加一步孤儿清算：

1. 新进程 / 运行时启动、内存 `activeRuns` 为空时，扫描 SQLite 中仍标 `running` 的本地消息。
2. 由于新进程此刻尚未 claim 任何 run，这些 running 记录**必然**来自已经消失的上一进程 → 判定为孤儿运行。
3. 对每条孤儿运行，走**既有的** stuck 落地路径：写一条带原因的可见系统记录、把消息标成 stuck、释放 / 恢复会话 cursor（复用 `MUST release or recover the session cursor after stuck recording`）。
4. reason 用一个比笼统 `stale-running` 更精确的孤儿原因（如 `orphaned-by-restart`），归入现有 stuck 分类，不新增对用户可见的状态种类。

### 前端

后端把消息落成 stuck 后，`TimelineEntry` 的既有终态映射会渲染「一步卡住了 ＋ 重试」，侧边栏对应红点。前端唯一要核验的是：`activeRun` 为空、而该 run 历史已是 stuck 时，不再出现假活运行块或空白运行态——这正是对齐场景 LC.T4.1 的 `not blank running`。预期前端零改动或仅需一处兜底判断。

### 判定的纯逻辑边界（可单测）

把「一批 running 记录 ＋ 当前进程的 activeRun 集合 → 需要落成 stuck 的孤儿集合」抽成纯函数：
- running 且不在 activeRun 集合内 → 孤儿，需落 stuck；
- 已是 stuck / failed / interrupted → 幂等跳过，不重复写记录；
- 正常持有 activeRun 的 run → 不动。

## 权衡

- **为什么不缩短 2h / 10min 时长判据**：那是「多久算卡住」的时长问题，PRD 明确列为待讨论·不作答。孤儿运行用「状态矛盾」判定，与时长正交，绕开待讨论；缩短时长判据留给产品另行裁决。
- **为什么复用 stuck 而不新增状态**：PRD 词汇表已有「一步卡住了」，孤儿运行对用户的含义就是「这一步不会自己好，需要重试或换人」，语义吻合。新增可见状态 = 产品意图变更，已被本轮边界排除。
- **为什么以启动 catch-up 为主、不做运行期轮询**：启动时判定零竞态（新进程无 in-flight run）、零阈值、最确定。进程未重启却 `activeRun` 异常丢失的情形极罕见，且需引入秒级防抖来避开「刚 claim、activeRun 还没建起」的竞态——收益低、复杂度高，留作后续，不在本 change 过度设计。
- **为什么不做计时 / 等待态 / runner 崩溃提示**：见 proposal「本 change 明确不做」——均为撞 PRD 既定裁决或与本地 session 痛点关联弱的项。

## 风险

- **误判正常运行为孤儿**：唯一风险是把正在正常运行的 run 误清算。启动 catch-up 时新进程本就没有任何 in-flight run，故不存在；只要判定严格锚定「启动阶段 ∧ 不在当前进程 activeRun 集合」，就不会误伤。（若未来扩展到运行期检查，必须引入秒级防抖，本 change 不引入。）
- **与 `repairStaleRunning` 的关系**：孤儿识别是它在重启场景的**快速前置**，不替代它；2h stale repair 保留作运行期长尾兜底，两者不冲突。
- **回滚**：纯增量判定，移除该步即回到「靠 2h stale repair 兜底」的原行为，无数据结构变更。
