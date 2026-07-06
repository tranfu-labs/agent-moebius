# 提案：agent-handoff-closing-protocol

## 背景

tranfucom#10 在同一位置发生了两次流程停滞，指纹完全一致：

1. 第一次：PM 验收全过后输出 `stage=in-progress` 且未交棒，CEO 守护审查该评论给出 `no_change`，收尾逻辑据"验收通过"关闭 issue——代码从未离开本地 worktree（无 commit、无 push、无 PR）。
2. 第二次（issue 重开后）：QA 输出「QA 结论：通过」，正文没有 mention 任何角色，CEO 守护再次 `no_change`，球落地无人捡。

根因拆解：

- **"下一步是谁"寄生在评论正文的自由发挥区**。qa.md 里其实已有"通过 → mention 发起需求角色"的规则（语义祈使句），但没有可机械核对的格式约束，agent 忘写时无人能廉价地发现。
- **CEO 守护的动作空间里 `no_change` 过宽**。ceo.md「code-verified：识别发起需求角色」第 3 条规定"发起者是真人 → `no_change` 等真人验收"，但没有任何动作去告诉真人——等待真人成了静默死等。
- **ceo.md「持续推进」是残缺章节**：只列了两个触发条件，正文没有任何动作指令。
- 顺带发现：product-manager.md 的工作流程要求输出 `stage=context-loaded` / `problem-framed` / `scope-locked` 三个值，均不在 `src/stages.ts` 枚举内，会被 `parseTrailingStageMarker` 解析为 null、manifest 记 `unknown`，静默漂移；且与该文件自己「输出契约」节"默认始终使用 in-progress"直接矛盾。

## 提案

纯提示词层改动（不碰运行时代码），两条已确认的修法：

1. **CEO 守护加「交棒完整性裁决（第 0 检查）」**：每条 `latestResponse` 必须含合法收尾行（`交棒：@<合法角色>` 或 `等待真人：<等什么>`，二选一恰一个）；两者皆无时 `no_change` 为非法选项，CEO 必须 `append` 路由。真人等待分支从"静默 no_change"改为"最新评论无等待真人行时 append 裸写请真人验收"。补完「持续推进」残段。
2. **五个角色 persona 换统一输出骨架**：`## 结论` / `## 依据` / <角色专属必填节（收编现有约定）> / `## 下一步`（交棒行） / stage marker 最后一行。骨架标题即思考引导，栏位缺失或空泛由 CEO 守护机械核查。收敛各文件与此冲突的旧交棒表述。
3. **顺带修复**：product-manager.md 的 `context-loaded` / `problem-framed` / `scope-locked` 全部改为枚举内合法值 `in-progress`；阶段语义移入「结论」节正文，停等表达移入「下一步」节的等待真人行。

## 影响

- 受影响文件：`agents/ceo.md`、`agents/dev.md`、`agents/qa.md`、`agents/product-manager.md`、`agents/dev-manager.md`、`agents/hermes-user.md`；`openspec/specs/github-issue-runner/spec.md`（归档时合并 delta）。
- 不改 runner/格式器代码；runner 每轮触发时重读 agents/*.md，改完即生效，无需重启。
- 预期行为变化：`ceo-guardrail-appended` 事件占比上升（漏交棒被补路由）；等待真人的评论在时间线上有显式请验收文字。
- 后续（不在本 change）：runner 停滞唤醒机械兜底、流程看板机制（治本）。
