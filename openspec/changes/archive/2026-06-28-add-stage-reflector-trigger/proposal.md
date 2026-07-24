# 提案：add-stage-reflector-trigger

## 背景
`@reflector` 作为普通 mention agent 会造成协作协议过松：agent 回复里再次出现 `@reflector` 时，runner 会把它当作新的普通 mention，容易在反思回复中形成循环。

更通用的模型是把“是否触发反思”从自然语言 mention 中拆出来，改成机器可读的 stage 触发方式。agent 只声明自己到了哪个阶段，具体哪个 stage 触发 reflector 由 reflector 的触发器定义决定。

## 提案
新增独立触发器模块：

- mention trigger：保留现有 `@agent` 触发方式。
- reflector stage trigger：当最新 agent 消息包含白名单 stage metadata 时，直接生成 reflector 评论，不调用 Codex reflector。

`dev.md` 先声明可输出 stage 枚举：

- `plan-confirmed`
- `code-complete`

agent 到达阶段时输出 HTML comment metadata：

```md
<!-- moebius:stage=plan-confirmed -->
```

reflector stage trigger 写死支持这些 stage，并生成带 `@<source-agent>` 的 reflector 评论，让现有 mention trigger 在下一轮触发源 agent 继续反思。

## 影响
- runner 不再直接调用 `selectMentionedAgent` 决定唯一触发方式，而是调用触发器解析入口。
- `@reflector` 不再作为普通 Codex agent 使用；reflector 的实际触发方式是 stage metadata。
- `agents/reflector.md` 保留为展示身份和规则说明，但不再承担 Codex 反思生成。
- 新增纯函数单元测试覆盖 stage 触发、普通 mention 触发、非白名单 stage、反射器自触发防护和重复 hook 防护。
