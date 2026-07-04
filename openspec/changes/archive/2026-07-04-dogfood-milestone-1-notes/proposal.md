# 提案：dogfood-milestone-1-notes

## 背景
里程碑 1 的 T5 是收尾 dogfood 归档任务：把 T1-T3 规则在真实 issue 中协同生效的证据写回 `docs/roadmap/milestone-1-acceptance-loop.md`，并把执行中发现的规则缺陷沉淀为下一里程碑候选。

PM 已确认本次口径：

- #34、#36、#39 都作为 dogfood 记录；#39 是主例，因为它额外证明 qa gate 真实介入 dev 方案修订。
- 每条 dogfood 记录同时写 issue 与 PR 链接对：#34 -> #35 merged、#36 -> #37 merged、#39 -> #40 merged。
- #38 只作为 SVG 死锁卡点证据，不写成成功闭环 issue。
- 5 条卡点写入独立的「里程碑 2 候选 / 卡点清单」小节，不追加成里程碑 1 的 T6/T7/T8。

## 提案
仅更新里程碑 roadmap 文档和本 change 记录：

- 在 `docs/roadmap/milestone-1-acceptance-loop.md` 的 T5 下追加 dogfood 证据，列出 #39 主例与 #34/#36 补充证据。
- 在同一文档的「里程碑收尾」前新增「里程碑 2 候选 / 卡点清单」小节，逐条记录 5 个候选问题、观察证据与影响。
- 将 T5 勾选为已完成。
- 不新增里程碑 1 后续任务，不现场修改规则或运行时代码。

## 影响
- 影响 `docs/roadmap/milestone-1-acceptance-loop.md`。
- 影响本次 OpenSpec change 文件，供方案验收与后续归档追溯。
- 不影响 `src/`、`agents/`、测试代码、运行时行为规格或模块依赖方向。
