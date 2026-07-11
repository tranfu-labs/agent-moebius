# 任务：codex-model-upgrade-5-6-sol

- [ ] `src/local-config.ts`：`CodexLocalConfig` 增加 `model?: string`；`isCodexShape` 白名单扩为 `["provider", "model"]` 并校验 model 类型；`parseLocalConfig` 里 model 与 provider 同规则 trim
- [ ] `src/config.ts`：新增 `DEFAULT_CODEX_MODEL = "gpt-5.6-sol"` 与 `resolveCodexModel(local)`；`CODEX_EXEC_OPTIONS_BASE` 常量改为 `buildCodexExecOptionsBase(model)` 函数；`buildCodexExecOptions` 增 `model` 参数；顶层导出 `CODEX_MODEL` 与更新后的 `CODEX_EXEC_OPTIONS`
- [ ] `tests/codex.test.ts`：把既有 `gpt-5.5` 字面量断言（buildCodexArgs 两处、provider override baseline 一处）更新为 `gpt-5.6-sol`；把 `CODEX_EXEC_OPTIONS_BASE` 的导入改为调用 `buildCodexExecOptionsBase("gpt-5.6-sol")`
- [ ] `tests/codex.test.ts`：新增 `[codex] model = "gpt-5.6-sol-preview"` 覆盖用例、`[codex] model = "   "` 回落默认用例、`[codex] model = 123` 拒绝用例、`[codex] provider="tranfu" model="gpt-5.6-sol-preview"` 组合用例、`[codex] extra="x"` 白名单回归用例
- [ ] `AGENTS.md`：把 `-m gpt-5.5` 改为 `-m gpt-5.6-sol` 并追加 "模型名可通过 `[codex] model = \"...\"` 覆盖"
- [ ] 运行 `pnpm typecheck` 与 `pnpm vitest run tests/codex.test.ts`，两者全绿
- [ ] `grep -rn "gpt-5.5"` 在 src/、tests/、AGENTS.md、openspec/specs/（排除 archive/、dist/、node_modules/）无残留
