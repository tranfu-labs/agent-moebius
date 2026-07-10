# 提案：codex-provider-override

## 背景

仓库对 `codex` CLI 的调用高度集中：

- `src/codex.ts` 里 `spawn("codex", buildCodexArgs(...))` 是唯一 fork codex 的地方。
- `src/config.ts` 里 `CODEX_EXEC_OPTIONS` 是唯一一处硬编码 `--yolo / --json / -m gpt-5.5 / -c service_tier="fast" / -c features.fast_mode=true / -c model_reasoning_effort="xhigh"` 的 flag 常量。
- `spawn` 不显式传 `env`，子进程直接继承 `process.env`。

当前 codex 依赖本机订阅（`~/.codex/auth.json`）走 OpenAI。仓库根 `.env` 已经预置 `TRANFU_API_KEY / TRANFU_BASE_URL / DEROUTER_API_KEY / DEROUTER_BASE_URL`，但源码里没有任何地方读它们；也没有任何「订阅 vs API」的开关。

需要一个可显式切换的能力：默认保持订阅现状；一条 TOML 配置就能让 codex 通过 tranfu / derouter 之类的 API 网关走，key 与 base_url 从 `.env` 读，`--yolo / --json / -m gpt-5.5 / xhigh` 等既有 flag 完全不变。

## 提案

在既有 codex 执行层加一层 **provider 覆盖**：

1. `LocalConfig` 新增可选 `[codex]` 段，只承载 `provider?: string`。
2. `.env` 通过 Node 内置 `process.loadEnvFile(".env")` 加载到 `process.env`；配置从 `provider` 名按约定 `<UPPER>_API_KEY` / `<UPPER>_BASE_URL` 读环境变量。
3. `CODEX_EXEC_OPTIONS` 从常量数组拆成 base 数组 + `buildCodexExecOptions(cfg)` builder；provider 缺省时输出与 base 数组字节等价；provider 存在时在末尾追加 5 组 `-c` provider 覆盖。
4. `spawn` 显式 `env: process.env`，避免后续被无意屏蔽。
5. 模型名 `-m gpt-5.5` 本轮不做成可配。

## 影响

**受影响模块**：

- `src/local-config.ts` — TOML schema 新增 `codex.provider` 字段与校验。
- `src/config.ts` — 抽 `CODEX_EXEC_OPTIONS_BASE`，导出 `buildCodexExecOptions(cfg)`。
- `src/codex.ts` — `buildCodexArgs` 顶层从 local-config 解析一次 provider；`spawn` 显式传 `env`。
- `src/runner.ts`、`src/local-console/server.ts`、`desktop/src/main.ts` — 入口首行 `process.loadEnvFile(".env")` try/catch。
- `config.toml` — 追加两行注释示例。
- `tests/codex.test.ts` — 新增三条断言（订阅基线、API 尾部追加、缺 env 报错）。

**对外行为**：

- 默认配置（无 `[codex]` 段）：`codex exec` 命令行与当前 `main` 分支**字节级等价**，走订阅。
- `[codex] provider = "tranfu"` + `.env` 中 `TRANFU_API_KEY / TRANFU_BASE_URL` 齐全：`codex exec` 末尾追加 `-c model_provider=tranfu -c model_providers.tranfu.name=tranfu -c model_providers.tranfu.base_url=<value> -c model_providers.tranfu.env_key=TRANFU_API_KEY -c model_providers.tranfu.wire_api=responses`；请求走 tranfu 网关。
- `[codex] provider = "tranfu"` 但 `.env` 缺 `TRANFU_BASE_URL` 或 `TRANFU_API_KEY`：启动时抛可见错误，包含缺失变量名，NEVER spawn codex。

## 验收语句

1. `config.toml` 无 `[codex]` 段时，`buildCodexArgs("hi", { kind: "full" }, [])` 返回数组与 `main` 分支基线**字节级一致**（`tests/codex.test.ts` 基线断言绿）。
2. `config.toml` 写 `[codex] provider = "tranfu"` + `.env` 有 `TRANFU_API_KEY=sk-xxx` + `TRANFU_BASE_URL=https://api.tranfu.com/v1` → 触发一次 codex 心跳 → 子进程 argv 末尾按顺序包含五组 provider `-c` 覆盖；`base_url` 为字面 URL 而非 `${TRANFU_BASE_URL}`；请求实际到达 tranfu 网关（后台账单可见）。
3. `[codex] provider = "tranfu"` 但 `.env` 缺 `TRANFU_BASE_URL` → 启动时抛错，错误信息包含变量名 `TRANFU_BASE_URL`；`spawn` NEVER 被调用。
4. `--yolo / --json / -m gpt-5.5 / -c service_tier="fast" / -c features.fast_mode=true / -c model_reasoning_effort="xhigh"` 在订阅与 API 两种模式下都出现在 `codex exec` argv 中。
5. `runCodex(...)` 所有既有调用方（`src/runner.ts`、`src/format-ceo.ts`、`src/runner/external-route.ts`、`src/local-console/runtime.ts`、`src/local-console/server.ts`）签名与调用点 NEVER 改动。
6. `tests/codex.test.ts` 除新增三条外全部保留通过；`pnpm typecheck` 与 `pnpm test` 全绿。
