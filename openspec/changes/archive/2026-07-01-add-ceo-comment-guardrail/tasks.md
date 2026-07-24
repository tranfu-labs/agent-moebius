# 任务：add-ceo-comment-guardrail

## 契约层
- [x] 新增 `src/stages.ts`，定义 `Stage` 联合类型与 `ReflectorStages` / `AllStages` 两个子集常量。
- [x] 更新 `agents/dev.md`：加"每条响应末尾必须显式声明 stage"契约、3 枚举说明（`plan-written` / `code-verified` / `in-progress`）、1-2 组正误对照示例。
- [x] 更新 `agents/product-manager.md`：加"每条响应末尾必须以 `<!-- moebius:stage=in-progress -->` 结尾"契约（product-manager 无终态 stage 语义，默认 `in-progress`）。
- [x] 更新 `agents/hermes-user.md`：同 product-manager，默认 `in-progress`。
- [x] 更新 `agents/reflector.md`：明确 reflector 由 runner 代码生成确定性 hook 评论，不受 CEO 拦截影响；若 reflector 自身通过其他路径生成 comment，也遵循默认 `in-progress` 契约。
- [x] 新增 `agents/ceo.md`：写入触发范围（所有 codex agent 响应）、识别场景清单（至少覆盖事故 1「缺失 stage marker」与事故 2「dev 收到收敛指令后无推进」，事故 2 规则限定 `agent === "dev"`）、输入契约、输出契约、修改红线（保留正文语义 / 保留原有内容 / stage marker 放最末尾 / quote 标注在 marker 之前 / 不需要 CEO 输出 `<!-- moebius:ceo-corrected -->` metadata，该 metadata 由 runner 追加）。事故 2 的具体处理动作由本文件自行定义。

## CEO 编排层
- [x] 新增 `src/format-ceo.ts`：加载 `agents/ceo.md`、组装短上下文 prompt（`originalRequest` / `latestResponse` / `agent` / `allowedStages` / `lastReflectorHook`）、以无状态方式调用 codex、解析 `NO_CHANGE` 或完整修正文本、后置宽容匹配验证。
- [x] 在 `src/runner.ts` mention Codex 分支的 `postComment` 之前插入 CEO 拦截：对所有 codex agent 响应触发；reflector 确定性 hook 评论不走 CEO；含 `<!-- moebius:ceo-corrected -->` metadata 的评论不再走 CEO；任何 CEO 异常一律 fail-open post 原文。
- [x] 在 CEO 返回修正版且后置验证通过后，由 runner 在最终 GitHub comment body 末尾追加 `<!-- moebius:ceo-corrected -->` metadata（位置在 role metadata 之后即 body 最末尾），然后 post。
- [x] 在 runner 层从当前 issue timeline 中定位最近一条 reflector hook 评论 body，作为 `lastReflectorHook` 传给 CEO（仅 dev 事故 2 判定用得上，其他 agent 传值也不影响）。
- [x] 结构化日志：CEO 命中修正、CEO 返回 NO_CHANGE、CEO 后置验证不通过 fail-open、CEO 超时 / 非法输出 fail-open 各记录一类 `event`。

## 触发器层
- [x] 修改 `src/triggers/reflector-stage-trigger.ts`：marker 识别正则改为宽容匹配（允许大小写、marker 内部多余空白、`=` 前后空白）；stage 名严格匹配 `ReflectorStages` 白名单；`in-progress` 明确不触发。

## 测试
- [x] `tests/stages.test.ts`：Stage 枚举与两个子集的常量断言。
- [x] `tests/format-ceo.test.ts`：
  - 事故 comment [4851370207](https://github.com/tranfu-labs/moebius/issues/10#issuecomment-4851370207) 的 body 作为固化用例；mock CEO 返回补齐 `code-verified` marker 的修正版；断言最终 post 文本包含正确 marker、包含 CEO quote 标注、原正文内容保留、结构顺序为「正文 → quote → marker」。
  - CEO 返回 `NO_CHANGE`（含前后空白 / markdown fence 包裹）→ 走原文分支。
  - CEO 返回"修正版但末尾无合规 marker" → 后置验证不通过 → fail-open post 原文。
  - CEO 超时 / 抛异常 / 返回空 → fail-open post 原文。
  - CEO 输出 stage 不在 `AllStages` → 后置验证不通过 → fail-open。
- [x] `tests/reflector-stage-trigger.test.ts` 增补：
  - 大小写混合、marker 内部多余空白、`=` 前后空白的宽容匹配用例。
  - `stage=in-progress` 明确不触发。
  - 现有 `plan-written` / `code-verified` 触发行为不变的回归用例。
- [x] `tests/runner.test.ts`（或对应现有 runner 单测）：
  - 所有 codex agent 响应（dev / product-manager / hermes-user）都触发 CEO 拦截。
  - 含 `<!-- moebius:ceo-corrected -->` metadata 的评论不再触发 CEO（防循环）。
  - reflector 确定性 hook 评论不触发 CEO。
  - CEO 修正版在 post 前正确追加 `<!-- moebius:ceo-corrected -->` metadata（body 最末尾、role metadata 之后）。

## AI 验证流程
- [ ] 本机 `pnpm start` 挂一个测试 issue，`@dev` 提一个小需求；观察 dev 每条响应都带 stage marker（`in-progress` 或 `plan-written`）。
- [ ] 临时修改 `agents/dev.md` 去掉 marker 契约后触发 dev 响应；观察 GitHub 上出现的评论是否是 CEO 补齐版（带 quote 标注、末尾有 marker），reflector 下一轮能否正常接力。
- [ ] 触达 `MAX_SELF_REFLECT` 上限后让 dev 消极响应；观察 CEO 是否按 ceo.md 里定义的事故 2 规则处理。

## 收口
- [x] `pnpm test` 全绿。
- [x] `pnpm typecheck` 通过。
- [x] 更新 `AGENTS.md`：新增 CEO 拦截层、`agents/ceo.md`、`src/format-ceo.ts`、`src/stages.ts` 的位置与职责说明；同步所有 codex agent 每条响应必须显式 stage 的新契约；说明 `<!-- moebius:ceo-corrected -->` metadata 的作用与识别机制。
- [x] 确认 `spec-delta/github-issue-runner.md` 覆盖新增行为、fail-open 边界、循环防护、触发范围与验证要求。
