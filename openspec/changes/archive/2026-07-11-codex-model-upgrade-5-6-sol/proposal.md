# 提案：codex-model-upgrade-5-6-sol

## 背景

codex CLI 已升级并支持 `gpt-5.6-sol` 模型。当前仓库对 codex 的模型选择集中在两处：

- `src/config.ts` 的 `CODEX_EXEC_OPTIONS_BASE` 常量数组硬编码 `-m gpt-5.5`。
- `openspec/specs/github-issue-runner/spec.md` 的 "Codex provider 覆盖" 小节把 `-m gpt-5.5` 明写进行为事实源基线里；`AGENTS.md` 与 `tests/codex.test.ts` 都跟着复述。

只需要升级模型名，其它 baseline flag（`--yolo` / `--json` / `service_tier="fast"` / `features.fast_mode=true` / `model_reasoning_effort="xhigh"`）不动。

之前的 `codex-provider-override` change 明确"模型名 `-m gpt-5.5` 本轮不做成可配"是当时的取舍。这一轮既然要动这个字面量，顺手把模型名抽成 `[codex] model = "..."` 可选覆盖——留一个配置面，日后再有小版本升级或对不同 provider 需要不同模型时不必再回来改常量。默认值 = `gpt-5.6-sol`；未设置或空白 → 用默认。

## 提案

1. `LocalConfig.CodexLocalConfig` 新增可选 `model?: string`；`isCodexShape` 白名单从 `{"provider"}` 放宽到 `{"provider", "model"}`，并按与 `provider` 一致的字符串/非空 trim 校验规则处理。
2. `src/config.ts` 新增常量 `DEFAULT_CODEX_MODEL = "gpt-5.6-sol"` 与解析函数 `resolveCodexModel(local)`（空白/未设回落默认）；把 `CODEX_EXEC_OPTIONS_BASE` 常量数组改成 `buildCodexExecOptionsBase(model)` 函数，让模型名参数化；顶层 `CODEX_EXEC_OPTIONS = buildCodexExecOptions(provider, model)`。
3. provider 覆盖能力完全不动——`[codex] provider` 与 `[codex] model` 独立生效，两者都存在时各自展开、互不干扰。
4. 事实源同步：`openspec/specs/github-issue-runner/spec.md` 里 `-m gpt-5.5` → `-m gpt-5.6-sol`，并新增"model 覆盖"要求条款；`AGENTS.md` 里同一句话同步替换并补一句"模型名可通过 `[codex] model = \"...\"` 覆盖"。

## 影响

**受影响模块**：

- `src/local-config.ts` — `CodexLocalConfig` 加 `model` 字段；`isCodexShape` 白名单扩容；`parseLocalConfig` 里同 `provider` 一样 trim。
- `src/config.ts` — 抽 `DEFAULT_CODEX_MODEL` 与 `resolveCodexModel(local)`；`CODEX_EXEC_OPTIONS_BASE` 常量改成 `buildCodexExecOptionsBase(model)`；顶层 `CODEX_EXEC_OPTIONS` 拼装位置随之更新。
- `tests/codex.test.ts` — 5 处 `gpt-5.5` 字面量更新为 `gpt-5.6-sol`；新增 `[codex] model` 覆盖/空白回落/非字符串校验/provider+model 组合用例。
- `AGENTS.md` — 一句话同步：`-m gpt-5.5` → `-m gpt-5.6-sol`，补覆盖说明。
- `openspec/specs/github-issue-runner/spec.md` — 归档时按本 change 的 spec-delta 合入。

**对外行为**：

- 默认（无 `[codex]` 段 或 `[codex].model` 未设）：`codex exec` argv 中 `-m` 值 = `gpt-5.6-sol`；其它 baseline flag 与 provider 覆盖逻辑与 `codex-provider-override` 保持字节等价（除模型名字面量变化外）。
- `[codex] model = "gpt-5.6-sol-preview"`：`codex exec` argv 中 `-m` 值 = `gpt-5.6-sol-preview`。
- `[codex] model = ""` / `"   "`：回落默认 `gpt-5.6-sol`（与 `provider` 空白语义一致）。
- `[codex] model = 123`（非字符串）：`parseLocalConfig` 抛可见错误，与既有 `provider` 类型错的错误路径一致。
- `[codex] provider = "tranfu" model = "gpt-5.6-sol-preview"`：前段 base 里 `-m` 值 = `gpt-5.6-sol-preview`，后段仍按顺序追加 5 组 `model_providers.tranfu.*` 覆盖，两者不交叉。

## 验收语句

1. `config.local.toml` 无 `[codex]` 段 → `buildCodexArgs("hi", { kind: "full" }, [])` argv 中 `-m` 值 = `gpt-5.6-sol`，其它 baseline flag 与顺序不变。
2. `config.local.toml` 写 `[codex] model = "gpt-5.6-sol-preview"` → argv `-m` 值 = `gpt-5.6-sol-preview`。
3. `config.local.toml` 写 `[codex] model = "   "` → 回落默认 `gpt-5.6-sol`。
4. `config.local.toml` 写 `[codex] model = 123` → `parseLocalConfig` 抛可见错误，NEVER spawn codex。
5. `config.local.toml` 写 `[codex] provider = "tranfu" model = "gpt-5.6-sol-preview"` + `.env` 齐全 → argv 前段 `-m` 值 = `gpt-5.6-sol-preview`；后段按顺序含五组 provider `-c` 覆盖。
6. `[codex] extra = "x"` 仍被 `isCodexShape` 拒绝（回归保护）。
7. `pnpm typecheck` 与 `pnpm vitest run tests/codex.test.ts` 全绿；`grep -rn "gpt-5.5" src/ tests/ AGENTS.md openspec/specs/`（排除 archive/）无残留。
