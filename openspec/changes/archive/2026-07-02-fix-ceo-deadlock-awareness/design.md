# 设计：fix-ceo-deadlock-awareness

## 方案

只增补 `agents/ceo.md`，在用户手写版本的骨架上扩展，不整体回滚到 `d98768d` 版：

1. **协作生态认知**（新章节，放在识别场景之前，作为判断依据）：
   - 真实可通过 mention 触发的 Codex agent：`dev`、`product-manager`、`hermes-user`、`tranfu-agents-manager`（对应 `agents/*.md` 减去 `NON_CODEX_MENTION_ROLES = {ceo, reflector}`）。
   - reflector 的真实机制：runner 检测到 stage marker 后确定性拼装的模板 hook，不是模型、不读回复；`@reflector` 不触发任何东西。
   - 系统中不存在 reviewer、manager、审核员等角色；等待它们确认等于永远等不到。
   - dev 常犯的错（经验清单）：把 reflector 当真人对话汇报；等待不存在的角色；收到反思提醒后只做确认式回复、无实质推进。
2. **识别场景新增「死锁等待」**：`latestResponse` 在等待不存在 / 不会响应的对象 → `append`，正文先纠正认知（对象不存在 / 不会响应），再直接裁决下一步（如"方案已通过反思，直接进入实现"）。用本次事故真实文本做样例。
3. **输出契约修正**：`{"action":"append","as":"<role>","body":"..."}`；`as` 允许值 `ceo` / `dev` / `product-manager` / `hermes-user` / `reflector`（与 `src/format-ceo.ts` 的 `CEO_APPEND_ROLES` 一致），默认用 `ceo`；`as=ceo` 时 body 不带 stage marker。

## 权衡

- **不改代码传入可用 agent 清单**：清单静态写进 persona。放弃了"代码是唯一事实源"的联动，换来零代码改动；spec 已有约定"事故规则扩展只改 ceo.md"。若未来新增 agent，需人工同步 persona——通过 spec 中既有的同步义务条款约束。
- **persona 不再承载 `replace`**：放弃了"缺 stage marker 走 replace 修复"的能力（该场景仍由 fail-open 兜底不阻断主流程），换来 persona 简单、CEO 判断负担小。代码层 `replace` 分支保留，未来要恢复只需改 persona。
- **不新增 ceo.md 内容契约测试**：用户明确不要；persona 与代码脱节的风险由 spec 条款 + 本次事故记录承担。

## 风险

- CEO 模型仍可能输出缺 `as` 的 JSON → fail-open，行为与现状一致，不会更糟；样例中显式给出带 `as` 的完整 JSON 以降低概率。
- 静态角色清单过期 → CEO 误判"角色不存在"。缓解：spec 中保留"新增 driver agent 时 MUST 同步 persona"义务。
- 回滚：`git revert` 本 change 对 `agents/ceo.md` 的提交即可，无状态迁移。
