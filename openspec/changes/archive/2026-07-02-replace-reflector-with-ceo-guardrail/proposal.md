# 提案：replace-reflector-with-ceo-guardrail

## 背景

当前 runner 在 Codex agent 评论发布后，会在本轮内把评论拼回 timeline，再通过 `reflector-stage-trigger` 对 `plan-written` / `code-verified` 生成确定性 `<reflector>` hook，提醒源 agent 做阶段反思。这导致协作模型里同时存在 CEO guardrail 与 reflector hook 两套纠偏入口：

- CEO 负责发布前 guardrail，可读取完整公开 issue context 并 append 独立评论。
- reflector 是 runner 拼装的模板身份，不是真 agent，但会以 `<reflector>` 可见身份出现在 issue 中。

用户希望移除旧 reflector 概念，把阶段反思统一放到 CEO guardrail 中；当 agent 输出 `plan-written` 或 `code-verified` 时，CEO 必须 append 评论来推动反思或继续推进。

## 提案

删除 reflector 角色和确定性 stage hook 链路，将阶段反思收口到 CEO guardrail：

- 删除 `agents/reflector.md` 角色素材。
- 删除 `src/triggers/reflector-stage-trigger.ts` 与 `src/triggers/self-reflect.ts` 自反辅助。
- `src/triggers/index.ts` 只保留普通 mention trigger。
- `src/runner.ts` 在 post agent 评论后不再进入 self-reflect loop；后续推进由 CEO append 中的 `@dev` 等 mention 在下一轮 active poll 触发。
- `agents/ceo.md` 增加强制业务规则：当 `latestResponse` 末尾 stage 是 `plan-written` 或 `code-verified` 时，必须返回 `append`，默认 `as=ceo`，正文中按需要 `@dev` 提醒反思或裁决继续推进。
- `src/format-ceo.ts` 的 append role 白名单删除 `reflector`。
- 移除 `MAX_SELF_REFLECT` 配置、日志字段和相关测试。
- 更新 OpenSpec、模块地图与 AGENTS.md，使事实源不再描述 reflector 机制。

前后流程差异：

```text
Before

[dev 输出 plan-written/code-verified]
        |
        v
[CEO guardrail 校正 latestResponse]
        |
        v
[post <dev>]
        |
        v
[runner self-reflect loop]
        |
        v
[reflector-stage-trigger 确定性生成]
        |
        v
[post <reflector>: @dev 请反思]
```

```text
After

[dev 输出 plan-written/code-verified]
        |
        v
[CEO guardrail 读取 latestResponse + issue context]
        |
        v
[CEO 按 ceo.md 强制 append]
        |
        v
[post <dev>]
        |
        v
[post <ceo>: @dev 请反思/推进]
```

## 影响

受影响模块：

- `agents/ceo.md`：新增阶段反思强制 append 规则，删除对旧 reflector 机制的正向依赖说明。
- `agents/reflector.md`：删除。
- `src/triggers/*`：移除 reflector stage trigger 与自反辅助。
- `src/runner.ts`：移除 post 后 self-reflect loop。
- `src/format-ceo.ts`：append role 集合移除 `reflector`，prompt 不再传 `lastReflectorHook`。
- `src/config.ts`：移除 `MAX_SELF_REFLECT` 与启动日志字段。
- `src/stages.ts`：移除 reflector-only stage 子集，只保留全局 stage 枚举与解析能力。
- `tests/*`：更新 trigger、runner、CEO 格式校验与旧 reflector 行为测试。
- `docs/architecture/module-map.md`、`AGENTS.md`、`openspec/specs/github-issue-runner/spec.md`：归档时更新事实源。

行为影响：

- issue 中不再出现 `<reflector>` 自动评论。
- `@reflector` 不再具有特殊语义，也不会触发 Codex。
- `append.as="reflector"` 变为非法，CEO 返回该 role 时 fail-open。
- `plan-written` / `code-verified` 阶段反思由 CEO guardrail persona 强制要求；CEO 调用失败仍沿用 guardrail fail-open 策略，不阻断原 agent 评论发布。
