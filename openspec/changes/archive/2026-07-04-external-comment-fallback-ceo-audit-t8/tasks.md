# 任务：external-comment-fallback-ceo-audit-t8

- [x] 扩展 intake state 类型与折叠逻辑，按 comment id 记录 external comment fallback route outcome，并保持旧 state 兼容。
- [x] 新增 CEO 式外部评论路由函数与 parser，校验 `no_action` / append 输出结构、单合法 mention 和 agent 白名单。
- [x] 在 runner no-trigger 分支接入 active-only 外部 comment 兜底路由，发布 `ceo` envelope append，并确保同一 comment id 不重复判定。
- [x] 为所有 runner 发布路径补 `ceo-reviewed` / bypass / not-applicable metadata，保留既有 `ceo-corrected` 语义。
- [x] 更新 `agents/ceo.md` 的无 mention 外部评论路由判据和输出约束。
- [x] 更新 `AGENTS.md`、`docs/architecture/module-map.md` 与 `openspec/specs` 对应 spec delta。
- [x] 补 intake 单元测试：三种 route outcome 按 comment id 记录、同 id 不重复判定、旧 state 缺字段兼容加载与折叠。
- [x] 补 CEO route parser 单元测试：`no_action` / append 成功；非法 JSON、空 body、无 mention、多 mention、未知 mention、`@ceo`、仅 fenced code / inline code 内 mention 均 fail-open。
- [x] 补 runner 编排测试：active changed job 触发兜底、idle changed job 不触发、runner metadata comment 不触发、本轮 route append 不直接运行目标 agent。
- [x] 补兜底路由活性测试：fake route promise 永久不 settle 或超过测试 timeout 预算时，issue job 有界 settle，记录 `fail_open`，不发布 append，后续心跳不阻塞，同 comment id 不重复判定。
- [x] 补发布审计测试：agent no_change、replace、append 原评论、CEO append 评论、CEO fail-open 原评论、media failure、artifact failure、dead-letter、fallback route append 全部带 `ceo-reviewed` 或明确 bypass/not-applicable reason。
- [x] 补 speaker 归一化测试：`ceo-reviewed` metadata 不改变 role metadata 归一化结果。
- [x] 跑 `pnpm test`、`pnpm typecheck`、`git diff --check`，修复失败。
