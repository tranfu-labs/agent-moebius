# 提案：session-jsonl-fact-log

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/adr/0004-jsonl-session-fact-log.md | 全文 | 每会话 jsonl 事实日志 + SQLite 保留流转状态与可重建索引 | 已写入 |
| docs/product/pages/main-left-sidebar.md | 复制对话记录路径 · 现状参考与产品缺口 | 记录文件是「复制对话记录路径」的前置落点 | 已写入 |

## 背景

会话消息目前只存在 SQLite `session_messages` 表（`src/sqlite-state-worker.ts` 的 CREATE TABLE），磁盘上没有可直接阅读的会话记录文件；jsonl 只出现在 run 级原始输出（`runDir/stdout.jsonl`）与已废弃 runner 的 `run-manifests.jsonl`。产品需要把一段对话的完整经过交给对话之外的工具或另一个 AI 复盘，ADR-0004 据此裁决存储分层：只追加的事实日志与可变状态/索引并存，不回到 T3 之前的碎片化。

## 提案

- 新增**每会话一个只追加的 jsonl 事实日志**，作为消息与会话事件（用户消息、Agent 最终消息、进度事件、系统记录、子会话创建等）的唯一事实源；文件一经写入不改写、不删除行；子会话是另一个 session id 的独立文件，父会话日志追加一条创建事件建立关联。
- **单写者**：会话 jsonl 只由桌面应用主进程经 store 单一漏斗写入；Codex 子进程原始输出继续写各自 `runDir`，不直接写会话日志；确认单实例（或等价会话级写锁）前提。
- **原子提交点**：一条消息以单行追加为提交点，写入顺序先日志后索引。
- **半行容忍**：读取端容忍并截断崩溃留下的不完整末行，追加端在下次写入前校正。
- **SQLite 定位调整**：凡可由 jsonl 推导的内容定义为可重建缓存；两边不一致以 jsonl 为准，提供重扫重建索引的路径。归档、路由裁决、未读、工作空间绑定、父子边等真可变状态继续留在 SQLite。
- **迁移**：现有 `session_messages` 一次性导出为各会话 jsonl；成功后记 marker，不删旧表数据，不允许旧数据反向覆盖新事实。
- 提供「按会话取记录文件稳定路径」的内部查询能力（供后续 change 的「复制对话记录路径」消费），路径不进任何界面文案或 DTO 展示字段。

## 影响

受影响模块：

- `src/local-console/store.ts` —— 全部 `append*` / `record*` 门面方法成为 jsonl 追加的单一漏斗（先日志后索引）。
- `src/sqlite-state-worker.ts` / `src/sqlite-state.ts` —— `session_messages` 相关写入分支的定位调整（真可变状态 vs 可重建索引）、迁移与重建命令。
- `src/local-console/runtime.ts` / `src/local-console/server.ts` —— 调用点语义不变，事件继续只经 store 进入存储。
- `src/config.ts` —— 会话日志根目录配置。
- `desktop/src/main.ts` —— 单写者/单实例前提确认。

对外行为：数据根下出现每会话持续更新的 jsonl 记录文件，可被外部工具只读跟读；文件被用户或外部工具修改、删除时对话历史随之受损，按既有加载异常路径如实呈现，不承诺恢复。

保持不变：时间线「运行中临时记录原地替换」是渲染语义，进度事件照常追加、界面取最新一条渲染；ADR-0003 的 SQLite driver 与 Worker 生命周期决策；`runDir` 原始输出与诊断 DTO 的既有形态；界面不出现任何路径或内部标识（验收 #13 既有约束）。
