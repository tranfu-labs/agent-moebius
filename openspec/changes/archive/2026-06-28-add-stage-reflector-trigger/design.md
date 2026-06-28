# 设计：add-stage-reflector-trigger

## 方案
新增 `src/triggers/`：

- `types.ts` 定义触发结果：
  - `run-agent`：交给现有 Codex agent 执行。
  - `post-comment`：runner 直接发表评论。
  - `skip`：无触发。
- `mention-trigger.ts` 封装现有 `@agent` 选择逻辑。
- `reflector-stage-trigger.ts` 解析 `<!-- agent-moebius:stage=<stage> -->`，白名单为 `plan-confirmed`、`code-complete`。
- `index.ts` 按固定优先级组合触发器：stage trigger 优先于 mention trigger。

reflector stage trigger 只在最新消息满足下面条件时触发：

1. 最新消息 speaker 是已知 agent，且不是 `user` / `reflector`。
2. 最新消息包含白名单 stage metadata。
3. 共享时间线里还没有针对同一 `sourceIndex + sourceRole + stage` 的 `agent-moebius:stage-hook` metadata。

触发后直接生成评论：

```md
&lt;reflector&gt;:
@<sourceRole> 请针对「<stage>」做一次反思。

<!-- agent-moebius:role=reflector -->
<!-- agent-moebius:stage-hook source=<sourceRole> stage=<stage> sourceIndex=<index> -->
```

`runner.ts` 只消费触发结果：

- `skip`：记录 skip。
- `post-comment`：直接 `postComment(body)`，不调用 Codex、不更新 role thread 状态。
- `run-agent`：沿用现有 Codex 执行流程。

`conversation.ts` 保留 timeline 和 mention 解析纯逻辑；新增 stage/hook metadata 解析放在 trigger 模块，避免把 reflector 业务细节塞回 conversation。

## 权衡
本方案不新增持久状态文件。重复防护通过 timeline 中的 `stage-hook` metadata 判断，符合 issue append-only 时间线模型；如果评论失败，timeline 中不会出现 hook，下轮可重试。

本方案不让 issue body 动态声明 stage 规则。阶段枚举先由 `dev.md` 文档声明，reflector trigger 内部白名单写死，避免外部 issue body 成为可执行或可配置控制面。

`@reflector` 普通 mention 不再触发 Codex reflector，这会改变上一版行为，但能避免 #37 中的循环。

## 风险
如果 agent 忘记输出 stage metadata，reflector 不会触发。通过 `dev.md` 明确阶段输出规则来降低风险。

如果未来多个 agent 都需要不同 stage，需要把 trigger 白名单扩展为 registry，而不是把规则继续堆在一个文件里。
