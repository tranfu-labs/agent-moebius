# 设计：ceo-json-output-with-append-mode

## 方案

### 1. CEO 输出契约（JSON）

```json
{"action":"no_change"}
{"action":"replace","body":"<改写后的完整原 agent 正文，末尾必带合法 stage marker>"}
{"action":"append","as":"<role>","body":"<以该 role 身份追加的独立评论正文>"}
```

- `action` 枚举：`no_change` / `replace` / `append`。
- `as` 枚举（宽口径）：`ceo` + 所有 `agents/*.md` driver agent（`dev` / `product-manager` / `hermes-user`）+ `reflector`。
- 解析兼容 fenced code block 包裹（沿用现有 `NO_CHANGE` 兼容风格）。
- **CEO 手笔标识**：无论 `replace` 还是 `append`，body 里都必须有一行 `> CEO guardrail: <本次动手原因>` quote 标注。此约束写进 `agents/ceo.md` 模板，code 层不校验。

### 2. 三种识别场景（写进 `agents/ceo.md`，code 不做业务判据）

| 场景 | 触发条件 | 输出 |
|---|---|---|
| **S1 · 缺失/非法 stage marker** | `latestResponse` 末尾无合法 marker 或 marker 不在 `allowedStages` 内 | `replace`：补 marker + quote 标注 |
| **S2 · dev 收敛指令后无实质推进** | `agent=dev` + `lastReflectorHook` 含 `[MAX_REFLECT]` / "最后一次自动反思" + `latestResponse` 仅"收到/看过/认可" | `append`：CEO 自选 `as` 身份追加督促（推荐 `as=ceo`） |
| **S3 · dev 停下问"是否创建 change 分支"** | `agent=dev` + `latestResponse` 停在等确认句式 + 被确认对象是"新建 change 分支" | `append`：CEO 自选身份追加"同意，@dev 自行推进"（`as=ceo` 或直接 `as=dev` 扮演决策继续） |
| 其他 | 白名单外的等确认题、CEO 无法判定 | `no_change` |

### 3. `src/format-ceo.ts` 契约扩展

- 解析入口 `parseCeoOutput` 改 JSON：识别 fenced code block、trim 后 JSON.parse；抛错 → FAIL_OPEN(`invalid-json`)。
- `FormatCeoResult` 4 态：
  - `NO_CHANGE`：沿用，早退。
  - `REPLACE`：`body` 为改写正文。post-validate 校验末尾 stage marker（沿用）。
  - `APPEND`：新增 `body` + `as` 字段。post-validate 校验 `as` 在允许集合内。
  - `FAIL_OPEN`：新增 reason `invalid-json` / `unknown-action` / `unknown-as` / `empty-body`。
- runner 侧的返回体结构：`body` + `action` + 可选 `as`。

### 4. `src/runner.ts` 发帖分支扩展（runner.ts:558-588 附近）

现状：拿 `finalText` → `formatCeoComment` → 用 `ceoResult.body` 走 `formatGuardedAgentComment(selectedAgent.name, ...)` → `postComment`。

新分支：

- `NO_CHANGE` / `REPLACE`：不变。
- **`APPEND`**：
  1. 先发原 `finalText`：`formatGuardedAgentComment(selectedAgent.name, finalText)` → `postComment`（`<dev>:\n${finalText}` + `role=<原 agent>` metadata；不追加 `ceo-corrected`，因为这是 dev 原话）。
  2. 再发 CEO 追加评论：`formatGuardedAgentComment(ceoResult.as, ceoResult.body)` 结果末尾追加 `ceo-corrected` metadata → `postComment`（前缀 `<${as}>:\n` + `role=${as}` metadata + `ceo-corrected` metadata）。
  3. `appendPostedComment` 顺序拼回 timeline：`(原 agent, dev 原话)` → `(as, CEO 追加正文)`。
- 同轮自反循环 runner.ts:589-618 不动：CEO 追加评论里若有 `@dev` mention → mention trigger（非 `post-comment` kind）→ `break` → 靠 active poll 拉起下一轮。
- 日志新增 `event=ceo-guardrail-appended`，含 `agent`、`as`、`issueKey`。

### 5. `src/conversation.ts` speaker 归一化扩展

`normalizeComment` 内的 `role=ceo` 需要特殊分支：**不走 `availableAgentNames` 白名单**，直接归为 `speaker=ceo`。理由：CEO 是系统内置 guardrail speaker（同 `user`、`reflector` 一样非 mention codex agent）。

改法：`parseMetadataRole` 拿到 `ceo` → 直接返回 `speaker=ceo`；其他 role 走现有 whitelist 校验路径不变。

### 6. `reflector-stage-trigger` 口径确认

- CEO append 评论 `as=ceo` 时不带 stage marker → 天然不触发 reflector。
- CEO append 评论 `as=<driver role>` 时若带 `plan-written` / `code-verified` marker → 正常触发 reflector 接力（是我们希望的效果：CEO 扮演 dev 声明阶段后接力）。
- 代码层预期不改，只在 spec 里明确"CEO 通过 `as=<driver role>` 追加的评论允许携带任意合法 stage marker，reflector 触发规则不变"。

## 权衡

### 为什么不统一走"独立评论"这一条路径

分析过：统一路径可以消除改写带来的 Codex thread 一致性和 LLM cache 破坏问题，但**"stage marker 补齐"（S1）本质是格式层动作，独立评论替补会让 stage 归属混乱**（reflector 该看谁的 stage？driver agent 的评论？还是 CEO 的？）。要么把 S1 兜底逻辑迁到 runner 层（改动面 2-3 倍），要么保留 S1 走改写——保留是更小、更聚焦的选择。

新契约让"格式层" S1 走 `replace`、"内容层" S2/S3 走 `append`，各归各的路径，边界清晰。

### 为什么 `as` 用宽口径（含 `reflector`）

允许 CEO 扮演 reflector 有边角用途（比如替 reflector 发一条 hook 评论收敛），风险由 `agents/ceo.md` 里的模板约束控制，code 层不做业务限制符合"判据只靠 CEO md"原则。`ceo-corrected` metadata 保证 CEO 假冒发的评论仍能被识别、不会二次校正循环。

### 为什么不强制 `append` body 含 `@<agent>` mention

用户明确"不用，根据我们的提示词来"——`@mention` 是 CEO 按 `agents/ceo.md` 模板自决的语义手段，不该在 code 层强制。dev 下一轮触发靠 active poll 兜底（1 分钟内），够用。

### 为什么 code 层几乎不做业务判据

用户明确"不需要只靠 CEO md 来判断"——所有场景判据（S1/S2/S3 触发条件、模板措辞、扮演谁）都写进 `agents/ceo.md`，code 层只兜格式层最基础的三条红线（合法 JSON、合法 action、合法 as）。这让未来新增识别场景只改 `agents/ceo.md`，符合现有 CEO guardrail 的可扩展性设计。

## 风险

- **CEO 返回结构不合法 JSON 的概率上升**：从字符串协议改到 JSON 后，模型偶尔可能包 fenced code、加解释文字。缓解：`parseCeoOutput` 兼容 fenced code block；解析失败 → FAIL_OPEN 沿用现状（发原文），不阻断主流程。测试中构造非法 JSON case 保证覆盖。
- **CEO 扮演 dev 追加评论导致 Codex thread 语义困惑**：dev 下轮 resume 时会看到时间线里多了一条"自己说过的话"（其实是 CEO 假冒的）。缓解：body 内 `> CEO guardrail: ...` quote 标注让 dev 阅读时能识别；`ceo-corrected` metadata 让审计可查。
- **APPEND 后 CEO 独立评论被下一轮 active poll 触发 CEO 二次校正**：`ceo-corrected` metadata 已覆盖此循环规避，`hasCeoCorrectedMetadata` 早退保持不变。
- **回滚**：CEO 契约破坏性变更（旧字符串协议不再兼容）。回滚思路：`format-ceo.ts` 保留旧字符串 parser 一段时间，`parseCeoOutput` 先试 JSON 失败退回旧协议——但**本次不做**，因为 CEO 是 code + persona 一起升级，改 `agents/ceo.md` 后 CEO 不会再输出旧格式；发布时保持 code / persona 同步 landing 即可。
