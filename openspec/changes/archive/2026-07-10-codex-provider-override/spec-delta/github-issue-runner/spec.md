# github-issue-runner spec delta：codex-provider-override

本 delta 在现有 codex CLI 执行层规则之上增加**provider 覆盖**能力：默认保持既有 `--yolo / --json / -m gpt-5.5 / xhigh` 配置且 codex 走本机订阅登录；当本地配置显式声明 provider 时，`codex exec` 命令行末尾追加一组 provider `-c` 覆盖，key 与 base_url 从 `.env` 按命名约定读，不改用户 `~/.codex/config.toml`、不改任何 runCodex 调用点、不改看门狗与 driver pool 语义。

## 新增行为规则

### Provider 覆盖开关
- MUST let the local configuration TOML expose an optional `[codex]` table carrying an optional `provider` string, so that a repository can switch its `codex` CLI invocations from the built-in subscription auth to an API gateway without editing the user's `~/.codex/config.toml`.
- MUST default to the subscription mode when the `[codex]` table is absent or `provider` is missing/empty; in this mode the `codex exec` argv MUST be byte-for-byte equivalent to the baseline (`--yolo`, `--json`, `-m gpt-5.5`, `-c service_tier="fast"`, `-c features.fast_mode=true`, `-c model_reasoning_effort="xhigh"` and no additional `-c` entries).
- MUST, when `provider = "<name>"` is set, load the API key and base URL from the process environment using the convention `<NAME_UPPERCASE>_API_KEY` and `<NAME_UPPERCASE>_BASE_URL` before spawning `codex`.
- MUST reject startup with a visible error containing the missing variable name when either `<NAME_UPPERCASE>_API_KEY` or `<NAME_UPPERCASE>_BASE_URL` is absent; MUST NOT spawn `codex` under these conditions.

### 覆盖 argv 形状
- MUST, when a provider is resolved, append exactly five `-c` overrides to the end of the base `codex exec` argv, in this order: `model_provider=<name>`, `model_providers.<name>.name=<name>`, `model_providers.<name>.base_url=<literal-url>`, `model_providers.<name>.env_key=<NAME_UPPERCASE>_API_KEY`, `model_providers.<name>.wire_api=responses`.
- MUST expand `base_url` to the literal URL string read from `<NAME_UPPERCASE>_BASE_URL` before writing it into the `-c` argument; MUST NOT ship the argument as a shell variable placeholder such as `${...}`.
- MUST NOT emit the API key value into any argv position; the key MUST only reach the `codex` subprocess through inherited process environment, referenced by name via `env_key`.
- MUST NOT rename or drop any element of the baseline `codex exec` argv; the five provider overrides are additive.

### 环境变量注入
- MUST load `.env` from the project root into `process.env` before any `process.env` read that could depend on it, using Node's built-in `process.loadEnvFile`; the shared configuration module (transitively imported by the main runner, local console server, and desktop main) MUST perform this load at its earliest module body statement.
- MUST tolerate a missing `.env` file or an older Node runtime without `process.loadEnvFile` support without failing.
- MUST NOT let `.env` loading override variables already present in `process.env` (i.e., an explicit `export TRANFU_API_KEY=...` wins over `.env`).
- MUST pass the parent process environment explicitly to the `codex` subprocess so that the variable named by `env_key` is guaranteed to reach it.
