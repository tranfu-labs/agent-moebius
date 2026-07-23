# 任务：right-sidebar-codex-rollout-history

前置：同步包含 `right-sidebar-process-tab`（`c3e5d19`）的最新基线；等待 `right-sidebar-change-project-files`、`right-sidebar-subtask-tab` 完成并合并后再开始实现，同时保留并回扫多 Agent execution lane 对 active run / session fact 的新语义。

- [x] T1: run-thread 关联事实
  - [x] `codex.ts` 从 `thread.started` 提供一次性 locator callback，成功 / 失败 / 中断路径一致
  - [x] session fact 写漏斗追加 `sessionId + runId + sourceMessageId + role + threadId + startedAt`
  - [x] 同值幂等、冲突 fail closed；不把 rollout 路径 / 内容写入普通 DTO
  - [x] 覆盖 thread 事件 chunk 拆分、重复、malformed、失败与并行 run 单测

- [x] T2: Codex rollout 唯一定位
  - [x] 新增 `codex-rollout.ts`，解析当前 Codex sessions 根并按 threadId 唯一定位
  - [x] realpath 根包含校验；缺失、重复、权限、损坏、文件替换 / 缩短均结构化返回
  - [x] 旧 run 没有 link 时明确 unavailable；不得读取 runDir / tmp 补 link，也不得按时间 / 角色 / 回复猜测
  - [x] 覆盖真实命名 fixture、缺失、重复、越界 symlink 与数据根变化

- [x] T3: 本轮公开输入恢复
  - [x] 按 attempt 的 sourceMessageId 从 session facts 恢复启动时公开时间线
  - [x] 保留用户 / Agent 角色、顺序、Markdown 与用户可见附件信息
  - [x] 排除 persona、团队规则、系统上下文、workspace / 附件内部路径
  - [x] 覆盖重试前后时间线不同、子会话与多 Agent lane

- [x] T4: rollout 事件 projector
  - [x] 新增纯函数映射 Agent Markdown、命令、工具 / 函数 / MCP、文件、错误
  - [x] 去重重复 Agent message；过滤协议噪音、prompt blob、token、内部 id 与 reasoning
  - [x] 未支持类型产出可见占位；malformed 完整行产出诊断，尾部半行等待追加
  - [x] 覆盖每类 fixture、未知类型、控制字符与安全 Markdown

- [x] T5: 反向分页与活动增量 API
  - [x] 按 requested run 聚合 source message 的全部 attempts
  - [x] 不透明 cursor 跨 attempt 反向分页，页内保持时间正序
  - [x] 每页事件数 + 字节数双边界；单个超大事件可独占超限页，但事件内容与全程都不截断
  - [x] append cursor 只取活动文件新增完整行；文件身份变化使 cursor 明确失效
  - [x] 过程文件不可用时不返回 stdout tail / 最终回复 fallback

- [x] T6: 友好过程事件组件
  - [x] `process-event.tsx` 呈现公开对话、Agent Markdown、命令、工具、文件、错误与未支持占位
  - [x] 复用 `MarkdownMessage` 安全管线；命令 / 工具输出只读可复制、不执行
  - [x] attempt / 本轮输入 / 本轮执行过程分隔与 PRD 线框一致
  - [x] 标题成员名 + 序号与现有 tab 契约保持不变

- [x] T7: 虚拟列表与 ChatGPT 式跟随
  - [x] 引入动态高度虚拟列表依赖并更新 lockfile
  - [x] 新增 `process-scroll-model.ts`：首开到底、底部跟随、离底暂停、到最新恢复
  - [x] 上滚加载前页后保持首个旧可见 event + 像素偏移
  - [x] tab 切换、关闭重开、应用重启恢复阅读锚点；重复点击来源不重置
  - [x] 大记录 DOM 节点数保持 viewport + overscan 有界

- [x] T8: 接线与回归
  - [x] desktop 请求 / 轮询改成 page + append cursor，错误与 abort 不污染其他 tab
  - [x] callsite sweep：active summary 仍可用 bounded tail，但过程标签不再消费 tail
  - [x] 回归改动 / 项目文件 / 子任务 tab、右栏宽度 / 开关 / tab 持久化
  - [x] console-ui、desktop、local-console 定向测试 + `pnpm typecheck` + `pnpm test`

- [x] T9: 真实桌面与大文件 AI 验证
  - [x] 实际 Agent run 点击完整输出 → 首开底部，公开输入一来一回正确、内部 prompt 不出现
  - [x] 运行中停底跟随；上滚后新事件不抢位；到最新恢复
  - [x] 同一步骤失败重试 → 两次输入 / 过程依次可见
  - [x] 合成大 rollout → 可向上读到第一条，DOM 有界、长输出不卡死
  - [x] 临时移走 Codex rollout → 明确不可用且不显示 fallback；恢复文件后可重试读取
