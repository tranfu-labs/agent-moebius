# 设计：dogfood-milestone-1-notes

## 方案
本次是文档事实归档，不做运行时代码或 agent persona 修改。

`docs/roadmap/milestone-1-acceptance-loop.md` 更新为三块：

1. T5 标题改为已勾选。
2. T5 下方新增「验收证据」，按 PM 口径写入：
   - 主例：issue #39 -> PR #40 merged，说明 #39 除完整闭环外，还证明 qa gate 在真实运行中介入 dev 方案修订。
   - 补充：issue #34 -> PR #35 merged，说明 T2 闭环跑通。
   - 补充：issue #36 -> PR #37 merged，说明 T3 闭环跑通。
   - dogfood 时间线结构：需求角色提需、dev `plan-written` 带验收语句、验收角色方案验收、dev `code-verified`、验收角色逐条走查。
3. 在「里程碑收尾」前新增「里程碑 2 候选 / 卡点清单」：
   - runner interrupt 竞态：Codex 直接 post 评论后，runner 误判 message count 增长为新消息并中断 CEO guardrail。
   - Codex `--image` 不接受 SVG：#38 因 SVG 被当图片输入导致 `codex-failed exit-code-1` 死锁。
   - prescript 失败不真的重试：日志显示重试排期，但 intake state 落盘失败计数未推进。
   - CEO `code-verified` 阶段路由缺 `@` mention：PM 不会被自动派上，需要人工补 ping。
   - dev 可能幻觉 commit / 文件写入：#39 中 dev 声称已 commit 和归档，但工作树仍有未提交改动。

每个卡点只记录观察证据与影响，不提出本次实现方案，不修改规则。

## 测试与验证
- 运行 `rg -n "T5|验收证据|里程碑 2 候选|#34|#35|#36|#37|#39|#40|#38" docs/roadmap/milestone-1-acceptance-loop.md`，应命中 T5 完成状态、三组 issue/PR 证据和五条卡点。
- 运行 `pnpm test`，应退出码 0。
- 运行 `pnpm typecheck`，应退出码 0。

## 权衡
- 选择把 #34/#36/#39 都写入 dogfood 记录，而不是只写一个 issue：PM 已确认三者共同证明闭环稳定性，#39 作为主例承载 qa gate 额外证据。
- 选择把 5 条卡点写成里程碑 2 候选小节，而不是新增里程碑 1 T6/T7/T8：T5 是事实归档，不扩展里程碑 1 范围。
- 选择 no-op spec delta：本次不改变 runner 行为、agent persona 或模块边界，更新 `openspec/specs/github-issue-runner/spec.md` 会把 roadmap 事实误写成运行时契约。

## 风险
- issue/PR 链接如果只写编号，读者仍需跳转上下文。缓解：同时写完整 GitHub URL 和编号。
- 卡点如果写成解决方案，容易误导为本次已修复。缓解：每条只写观察证据与影响，明确为候选问题项。
- 文档任务不新增测试逻辑，验证主要依靠文本检查和现有全量测试/typecheck。
