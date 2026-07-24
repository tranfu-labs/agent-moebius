# 设计：add-acceptance-walkthrough-personas

## 方案
本变更只把 T3 的验收职责写入两个可被 mention 的 persona。

1. 在 `agents/hermes-user.md` 的输出契约之后增加「验收职责」小节。
   - Hermes 用户画像的主职责仍是代表目标用户判断体验与执行系统价值。
   - 新小节只定义当它被 CEO / issue timeline mention 请求验收时的输出规则。
2. 在 `agents/product-manager.md` 的输出契约之后增加同名「验收职责」小节。
   - 产品经理的主职责仍是定义正确问题、产品取舍和结果。
   - 新小节只定义验收请求场景下的行为，避免与阶段 A/B/C 工作流混淆。
3. 两个 persona 使用一致的验收输出契约：
   - 先识别请求是在验收方案还是验收代码结果。
   - 按收到的「验收语句」逐条输出，每条一行：`通过 / 不通过 + 依据`。
   - 方案阶段依据为方案文本能否覆盖目标与边界。
   - 代码阶段依据为 dev 提供的证据，例如测试输出、截图 artifact、文件路径、命令输出。
   - 全部通过时声明验收通过，并说明下一步等待谁。
   - 任一不通过时 mention `@dev`，列出未过语句、实际观察与期望差异。
   - 最后一行仍必须保留 `<!-- moebius:stage=in-progress -->`。
4. 验证不新增测试文件：
   - 读取两个 persona 文件，文本检查其均包含逐条走查、结构化结论、不通过时 mention `@dev`、方案阶段依据、代码阶段依据、全部通过下一步等关键契约。
   - 构造一段含 3 条验收语句且 1 条明显不满足的验收请求，按 persona 规则手工 dry-run 期望输出：三条逐条结论，其中失败项 mention `@dev` 并指出实际观察与期望差异。
   - 现有 `pnpm test` 与 `pnpm typecheck` 作为项目健康检查，不把 LLM 行为伪装成确定性单元测试。

spec-delta 写入 `openspec/changes/add-acceptance-walkthrough-personas/spec-delta/github-issue-runner.md`，归档时合入 `openspec/specs/github-issue-runner/spec.md`。

## 权衡
- 不改 runner / trigger / CEO 代码：T2 已负责把验收请求 mention 到对应角色；T3 只需要让角色收到请求后知道如何验收。
- 两个 persona 各写同一套验收契约，而不是抽到共享文件：runner 直接读取 `agents/<name>.md` 作为 persona，重复少量规则比新增加载机制更稳。
- 验证以文本检查与 dry-run 为主，不真实调用 Codex：当前系统没有 product-manager / hermes-user 的离线模拟 driver；真实行为最终由 dogfood 任务 T5 验证。本任务用 persona 明文规则避免把 LLM 输出当确定性单元测试。
- 不把验收职责写进 `agents/ceo.md`：CEO 只负责路由验收请求，验收角色如何给结论属于本 change。

## 风险
- persona 规则仍依赖模型遵循，不能像 TypeScript 校验一样硬阻断。通过把输出格式、失败回流和证据来源写成明确 MUST，并用文本检查降低漂移风险。
- Hermes 用户画像不是传统验收人，可能把判断滑向泛用户感受。小节会限定它只在收到验收请求时按验收语句走查，其他用户画像职责不变。
- product-manager 现有阶段工作流使用非注册 stage 示例（如 `context-loaded`），但当前 T3 不触碰该旧问题，避免扩大范围。

## 验证计划
- 文本检查：`rg -n "验收职责|逐条|通过|不通过|@dev|方案阶段|代码阶段" agents/hermes-user.md agents/product-manager.md`
- 模拟检查：按 persona 规则 dry-run 一轮含 3 条验收语句且 1 条明显不满足的验收请求，确认期望响应会逐条结论并 mention `@dev`。
- 项目检查：运行 `pnpm test` 与 `pnpm typecheck`。
