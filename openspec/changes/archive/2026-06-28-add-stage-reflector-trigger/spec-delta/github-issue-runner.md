# github-issue-runner spec delta

## 修改
- MUST 将 agent 触发决策封装为独立触发器；runner 只消费触发器结果，不把具体触发方式写死在编排流程中。
- MUST 保留 mention trigger：最新消息包含已存在 agent mention 时，触发对应 agent。
- MUST 支持 reflector stage trigger：最新非 `reflector` agent 消息包含 `<!-- moebius:stage=<stage> -->` 且 stage 在白名单内时，runner 直接发布 reflector 评论。
- MUST 先支持 `plan-confirmed` 与 `code-complete` 两个 reflector stage。
- MUST 让 reflector stage trigger 生成的评论包含 `<!-- moebius:role=reflector -->` 与 `<!-- moebius:stage-hook source=<role> stage=<stage> sourceIndex=<index> -->` metadata。
- MUST 对同一 `source + stage + sourceIndex` 只发布一次 stage hook 评论；重复防护基于共享时间线中的 `stage-hook` metadata。
- MUST NOT 对 `reflector` 自己的消息触发 reflector stage trigger。
- MUST NOT 通过普通 `@reflector` mention 启动 Codex reflector；reflector 的触发方式是 stage metadata。
