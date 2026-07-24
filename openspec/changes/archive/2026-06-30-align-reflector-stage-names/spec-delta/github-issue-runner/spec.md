# github-issue-runner spec-delta：align-reflector-stage-names

## 修改
- reflector stage trigger MUST 支持 `plan-written` 与 `code-verified` 两个 stage。
- `agents/dev.md` 输出 `<!-- moebius:stage=plan-written -->` 或 `<!-- moebius:stage=code-verified -->` 时，runner MUST 直接发布 reflector hook 评论。
- `plan-confirmed` 与 `code-complete` 不再是 reflector stage trigger 的受支持阶段。

## 场景更新
### 场景 7：通用反思者 — agent 输出 plan-written stage 时触发反思接力
Given 最新消息 speaker 是 `dev`
And 最新消息 body 包含 `<!-- moebius:stage=plan-written -->`
And `agents/reflector.md` 存在
When 一次轮询取回该 issue
Then reflector stage trigger 直接发布 `reflector` 评论
And comment body 包含 `@dev 请针对「plan-written」做一次反思。`
And comment body 包含 `<!-- moebius:role=reflector -->`
And comment body 包含 `<!-- moebius:stage-hook source=dev stage=plan-written sourceIndex=<latest-index> -->`
And 系统不调用 Codex reflector

### 场景 9：通用反思者 — reflector hook 评论继续触发源 agent
Given 最新消息 speaker 是 `reflector`
And 最新消息 body 包含 `@dev`
And 最新消息 body 包含 `<!-- moebius:stage-hook source=dev stage=plan-written sourceIndex=1 -->`
When 一次轮询取回该 issue
Then mention trigger 选择 `dev`
And 系统按 `dev` role thread 执行 Codex
