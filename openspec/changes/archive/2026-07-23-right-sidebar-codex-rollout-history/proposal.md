# 提案：right-sidebar-codex-rollout-history

## 需求基线

产品事实源锚点：`docs/product/pages/main-right-sidebar.md#过程标签`、`#内容更新`、`#响应式与窗口行为`、`#codex-过程记录可能不可用`。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-right-sidebar.md` | 页面结构 · 过程标签 | 过程标签改为友好完整过程时间线，首次位于底部、上滚加载更早内容 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 区域与信息 · 过程标签 | 定义公开输入、Codex 事件投影、重试分段、缺失状态与非目标 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 操作与反馈 · 内容更新 | 定义底部跟随、离底暂停、到最新与阅读位置恢复 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 已知隐患 · Codex 过程记录可能不可用 | 取消 64KB 尾部截断契约，接受 Codex 源文件缺失时明确不可用 | 已写入 |
| `docs/product/pages/main-right-sidebar.wireframe.html` | 3 / 10 · 过程标签 / 记录不可用 | 更新为公开输入 + 执行事件 + 到最新及不可用空态的验收参考 | 已写入 |

## 背景

已合入的 `right-sidebar-process-tab`（`c3e5d19`）完成了过程标签、同一步骤多次执行聚合和可见截断，但它读取的是 Moebius 运行目录中 `stdout.jsonl` / `stderr.log` 的 64KB 尾部。页面标题写「完整输出」，实际却只保留末尾，开头过程无法向上查看；跨重启时运行目录消失又会降级成最终回复。

Codex 本身在其 sessions 根目录保存 rollout JSONL。对用户提供的一个真实 Moebius session 样本做只读验证后，14 个有落地运行目录的 run 均从 `thread.started.thread_id` 唯一匹配到一个 Codex rollout 文件；文件内包含公开消息、Agent 消息、工具 / 函数 / MCP 调用与结果、错误和任务事件，足以生成友好过程视图。

当前缺口不是再保存一份输出，而是：

1. Moebius session 事实没有持久化 `runId → Codex threadId`，因此现有 run 不具备可跨重启依赖的稳定关联；
2. 过程标签没有读取 Codex rollout、过滤内部 prompt 并投影用户有意义事件的适配层；
3. 大型记录没有反向分页、虚拟列表与 ChatGPT 式底部跟随模型。

## 提案

把过程标签从「运行目录尾部文本」升级为「Codex rollout 的友好完整过程时间线」。

1. **只保存定位关系**：Codex 发出 `thread.started` 时，在对应 Moebius session JSONL 追加 `runId → threadId` 事实，同时保存源消息 id、角色和启动时间等关联元数据；不复制 rollout 内容。
2. **直接读取 Codex rollout**：按 threadId 在当前 Codex sessions 根中唯一定位 rollout 文件。关联不存在，或文件不存在、重复、损坏、不可读时明确返回不可用；不从 runDir / tmp 补关联，也不使用 stdout tail、最终回复或时间猜测冒充。
3. **还原本轮公开输入**：从 Moebius session 事实恢复该次 run 启动时实际可见的用户 / Agent 公开时间线，按主对话的 Markdown 方式呈现；不把 persona、团队规则、系统指令与附件内部路径显示成原始 prompt。
4. **投影完整执行过程**：从 rollout 映射 Agent Markdown、命令、工具 / 函数 / MCP、文件操作、错误和诊断；隐藏协议事件、内部 id、token 统计、系统上下文与原始 reasoning。新事件类型不得静默丢失，先显示可见的未支持占位。
5. **大记录可持续阅读**：后端按不透明游标反向分页并支持活动文件增量读取；前端用动态高度虚拟列表，首次打开在底部，上滚加载更早过程，离底暂停跟随，到底恢复；切换 / 重开标签保持阅读位置。
6. **重试仍是一条过程线**：沿用既有源消息聚合口径，每次 attempt 都保留自己的公开输入和执行过程，依次编号，不覆盖。

## 影响

受影响模块：

- `src/codex.ts`：从结构化 stdout 事件捕获 threadId，并为成功、失败、中断都提供一次性 locator 回调。
- `src/local-console/store.ts`、session fact schema / 读取辅助、`types.ts`：追加与恢复 run-thread link；不新增 rollout 内容副本。
- `src/local-console/codex-rollout.ts`（新增）：Codex sessions 根解析、唯一文件定位、文件身份校验、反向 JSONL 分页与活动追加读取。
- `src/local-console/process-event-projector.ts`（新增）：rollout → 用户可见事件 DTO；隐藏内部上下文并为未知类型产出占位。
- `src/local-console/runtime.ts`、`server.ts`：按步骤聚合 attempts，恢复本轮公开输入并提供游标接口；旧 tail 接口只保留给不相关的活动摘要消费者。
- `packages/console-ui/src/console/process-tab.tsx`：从整段 `<pre>` 改成友好事件时间线。
- `packages/console-ui/src/console/process-event.tsx`、`process-scroll-model.ts`（新增）：事件组件与底部跟随 / 阅读位置状态机。
- `packages/console-ui/package.json`、`pnpm-lock.yaml`：引入动态高度虚拟列表依赖。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`、右栏 tab preference：分页 / 增量读取、每标签阅读锚点和重启恢复。
- 对应共置测试、`tests/codex.test.ts`、`tests/local-console.test.ts`、`desktop/tests/console-state-sync.test.ts`。

前置与并行边界：

- 实现基线必须包含已合入的 `right-sidebar-process-tab`（`c3e5d19`）。
- `right-sidebar-change-project-files` 与 `right-sidebar-subtask-tab` 正在独立 worktree 实现；本 change 方案不改其职责。开始写码前先等两片合并并同步基线，再在共享 `app.tsx` / `operator-console.tsx` 接缝上做最终 callsite sweep。

对外行为：用户从任一 Agent 消息点击「完整输出」，先看到底部最近过程；可持续向上读到该步骤每次执行的公开输入与全部可读事件。Codex 文件不在时只显示明确不可用。

明确不做：不复制 Codex rollout 内容；不展示原始 JSON、系统 prompt、persona、团队规则、token 统计或原始 reasoning；不改改动 / 项目文件 / 子任务标签；不在过程标签提供写操作。
