# 任务：session-jsonl-fact-log

- [x] 定义会话 jsonl 事件行格式与文件布局，配置根目录（src/config.ts）
- [x] store 层单一漏斗：全部 append*/record* 门面先追加 jsonl 行再更新 SQLite（先日志后索引），覆盖设计文档列出的全部消息产出点
- [x] 子会话创建事件写入父会话日志并建立独立子会话文件
- [x] 读取端半行容忍与截断；追加端下次写入前校正
- [x] session_messages 一次性迁移：按会话导出历史 jsonl + marker + 抽查比对 + 不反向覆盖
- [x] SQLite 可重建部分标定与从 jsonl 重扫重建入口
- [x] sessionId → 记录文件稳定路径的内部查询能力（不进展示字段）
- [x] 单写者/单实例前提确认（desktop 主进程写链）
- [x] 测试：追加与读取往返、崩溃半行、迁移与 marker、重建一致性、路径查询
- [x] spec-delta：为上述行为逐条写 Requirement（local-console 域）
