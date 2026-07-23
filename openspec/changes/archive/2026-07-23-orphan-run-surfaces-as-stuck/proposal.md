# 提案：orphan-run-surfaces-as-stuck

## 需求基线

本 change **不改动任何 PRD**——它让实现兑现产品事实源里早已写下、但当前实现要等 2 小时才兜住的承诺。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/main-conversation.md | 三种不可继续状态的共同规则 / 时间线 | 无改动；已写「不得在执行已经无法继续时仍显示成员正在工作」 | 已写入（既有） |
| docs/product/pages/main-left-sidebar.md | 对话状态点与顺序 / 项目目录不可用 | 无改动；已写「不得长期显示闪烁运行点」 | 已写入（既有） |

> 产品意图零变更，因此不新增、不修改任何产品词汇（不加计时、不加等待态、不新增任何可见状态）。本 change 的性质是**行为规格强化**：给已有的「不许把死的 run 显示成活的」补一条不依赖时长判据的确定性识别路径。

## 背景

本地会话页「看着长时间没动」，一个高频且最误导的成因是**孤儿运行**：

- 主进程 / 本地运行时重启过一次，内存里的 `activeRuns` Map 被清空；
- 但 SQLite 里那条消息仍标着 `running`（进程是被打断的，没机会落终态）。

此后没有任何代码路径会再喂这条 run——它 100% 不可能再产出。但界面表现是「假活」：对话流里连运行块都不出现（`activeRun` 为空），只剩用户最后一句话静躺，侧边栏却仍在闪烁运行点。用户完全无法判断它已经死了。

`openspec/specs/local-console/spec.md` 其实**早已禁止这种表现**：
- 「卡住状态」节：`MUST NOT leave a session permanently running after timeout or stale running repair`；
- 场景 LC.T4.1：`the UI does not show a blank running state`。

当前实现的唯一兜底是 2 小时的 `repairStaleRunning`（stale running → stuck）。孤儿运行就落在这 **2 小时窗口**里：spec 明令禁止、实现却没在第一时间兜住。

## 提案

在**启动 catch-up**阶段，把「SQLite 标记 running、但当前进程内存中没有对应 `activeRun`」的本地运行确定性判定为孤儿运行，落成**既有的**卡住（stuck）状态——追加带原因的可见系统记录、释放会话 cursor，复用 PRD 早已定义的「一步卡住了 ＋ 重试」呈现。

判据天然干净：**新进程刚启动，尚未 claim 任何 run，内存里不可能持有 `activeRun`**；此刻 SQLite 里还标 running 的必然是上一进程的孤儿。这是「两个状态对不上」的当场判定，**不需要任何时长阈值**，因此与「多久算卡住」的时间判据正交。

### 本 change 明确不做（及理由）

| 不做 | 理由 |
| --- | --- |
| 「已运行 X」计时 | PRD main-conversation.md「运行中的操作条不显示计时」+ 待讨论悬置 |
| 「轮到你了 / 等你确认」等待态 | PRD「不出现『等你回话』这类词」+ 2026-07-21 裁决否决 Agent 主动声明裁决 |
| 缩短 2h / 10min 时长判据 | 踩 PRD「一步卡住的判据是什么…明确不作答」，不擅自替产品拍板 |
| runner（GitHub-mode）崩溃提示 | 那条线与本地 session 死活基本独立；PRD 指定其呈现位置在设置入口附近，另案 |

## 影响

- **local-console 域（后端，主）**：启动 catch-up 判定逻辑；复用现有 stuck 记录写入与 cursor 释放路径。
- **console-ui（前端，极小或零）**：后端把消息落成 stuck 后，已有的「一步卡住了」终态呈现自然渲染；仅需核验 `activeRun` 为空且历史为 stuck 时不再出现假活 / 空白运行态。
- **对外行为**：孤儿运行从「假活、要等 2h」变为「重启后立即呈现为可重试的卡住」。
- **不动**：GitHub runner 语义、2h `repairStaleRunning`（保留为运行期长尾兜底）、任何产品词汇与版式。
