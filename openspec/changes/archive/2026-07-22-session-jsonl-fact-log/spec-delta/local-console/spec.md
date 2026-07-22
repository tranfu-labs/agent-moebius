# local-console spec delta：session-jsonl-fact-log

## Requirement: 每会话 jsonl 是历史消息唯一事实源
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 以每个 session 独立的 jsonl 事件流恢复会话历史，SQLite 中的 `session_messages` 仅作为可丢弃缓存。系统 MUST NOT 在 jsonl 与 SQLite 冲突时以 SQLite 覆盖 jsonl。

### Scenario: 索引内容与事实日志冲突
- GIVEN 同一会话的 jsonl 与 `session_messages` 内容不同
- WHEN store 初始化或读取该会话
- THEN 返回 jsonl 中的消息，并可由 jsonl 重建 SQLite 缓存

## Requirement: 事实日志只追加完整事件行
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 将每次会话事实写入编码为一条以换行结束的 JSON 事件，并保留既有完整事件行。系统 MUST NOT 就地改写或删除既有完整事件行。

### Scenario: 连续产生会话事实
- GIVEN 会话日志已有一条完整事件行
- WHEN 同一会话新增一条用户或 Agent 消息事实
- THEN 文件末尾新增一条完整事件行，原有完整行字节保持不变

## Requirement: 生产写链只有一个串行写者
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 由持有桌面单实例锁的主进程通过 store 写漏斗串行提交会话 jsonl 与 SQLite 索引。系统 MUST NOT 允许 runtime 绕过该漏斗直接写会话消息、子会话卡片或 workspace diff。

### Scenario: runtime 产生跨模块会话事实
- GIVEN desktop 主进程已取得单实例锁并装配 local console store
- WHEN runtime 创建子会话、追加子会话卡片或记录 workspace diff
- THEN 写入请求经同一个 store 串行写漏斗提交到相应会话日志

## Requirement: 读取容忍末尾半行且下次追加先修复
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 在读取时忽略并截断文件末尾未以换行结束的半行，且追加前再次校正末尾再写入完整事件。系统 MUST NOT 忽略中间或已换行闭合的非法 JSON 行。

### Scenario: 崩溃留下末尾半行
- GIVEN 会话日志包含若干完整行和一条未闭合的末尾 JSON
- WHEN 读取后再次追加事实
- THEN 读取结果只包含完整行且读取后旧半行已被截断，追加后的新事件可被完整解析

## Requirement: jsonl 持久化是 SQLite 提交的前置提交点
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 在同一事实写入中先持久化并 fsync jsonl 事件，再提交对应 SQLite 事务。系统 MUST NOT 在 jsonl 追加失败时提交该事实的 SQLite 消息索引变更。

### Scenario: 日志追加失败
- GIVEN 会话日志目标不可写
- WHEN store 提交一条会产生消息索引变更的事实
- THEN 操作失败且 SQLite 中不出现该次变更

## Requirement: 一次性迁移不得反向覆盖已有日志
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 在迁移标记缺失时仅为尚无 jsonl 的会话导出 `session_messages` 历史、校验消息数与首尾样本后写入迁移标记。系统 MUST NOT 以旧 SQLite 行覆盖已存在的会话 jsonl，且迁移标记存在后不得再次导出。

### Scenario: 已有日志与旧表并存
- GIVEN 会话已有 jsonl，同时 SQLite 留有内容不同的旧 `session_messages`，迁移标记尚未写入
- WHEN store 执行启动迁移并再次重启
- THEN 既有 jsonl 保持不变，迁移标记只在校验完成后生效，后续启动不反向导出旧表

## Requirement: SQLite 消息索引可由 jsonl 完整重建
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 提供从一个或全部会话 jsonl 重扫并重建 `session_messages` 的内部入口。系统 MUST NOT 要求保留旧消息索引才能恢复会话历史。

### Scenario: 消息索引被清空
- GIVEN 会话 jsonl 完整且对应 `session_messages` 已被删除
- WHEN 执行消息索引重建入口
- THEN SQLite 中恢复与 jsonl 一致的消息集合和状态

## Requirement: 子会话拥有独立日志且父会话记录创建事实
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 为子会话建立独立 jsonl 文件，并在父会话日志追加可关联该子会话的创建事件。系统 MUST NOT 只把子会话内容混写进父会话日志。

### Scenario: 从父会话创建子会话
- GIVEN 父会话已有独立事实日志
- WHEN runtime 从父会话创建一个子会话
- THEN 父日志包含子会话创建事实，子会话路径存在独立日志且子消息只出现在子日志

## Requirement: Agent 可见进度以追加事件保留
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 把同一 run 的每段 Agent 可见进度作为独立事件追加到会话 jsonl，并让界面继续只原地替换同一个活动节点。系统 MUST NOT 把进度事件插入 `session_messages` 或在完成后留下额外历史消息。

### Scenario: 一个 run 产生多段可见进度
- GIVEN 会话中的 Agent run 已开始
- WHEN Codex 依次产生两段 Agent 可见 Markdown 后返回最终消息
- THEN jsonl 按顺序包含两条进度事件，时间线运行中只更新一个节点且完成后只新增一条最终 Agent 消息

## Requirement: sessionId 稳定映射到内部记录路径
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 在固定 sessions 根目录下把同一 sessionId 确定性映射到同一 jsonl 路径，并提供内部查询能力支持“复制对话记录路径”。系统 MUST NOT 把该本机路径加入常驻会话或侧边栏展示 DTO。

### Scenario: 重启前后查询记录路径
- GIVEN 同一数据根和 sessionId
- WHEN 分别在 store 重启前后查询记录路径
- THEN 两次得到相同绝对 jsonl 路径，常规会话列表字段不包含该路径
