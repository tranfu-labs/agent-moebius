# 设计：codex-provider-override

## 方案

本 change 只扩展 codex 执行层的**参数拼装**与**环境变量注入**，不改任何 runCodex 调用方、不改看门狗、不改 driver pool、不改 UI。改动集中在 4 个文件（外加入口 3 处一行加载 `.env`）。

### 1. TOML 配置形态（选定 D 方案）

`config.toml` / `config.local.toml`：

```toml
[codex]
# 缺省整个 [codex] 段 = 订阅模式（现状）
# provider = "tranfu"    # 切到 tranfu API 模式，读 TRANFU_API_KEY / TRANFU_BASE_URL
# provider = "derouter"  # 切到 derouter，读 DEROUTER_API_KEY / DEROUTER_BASE_URL
```

命名约定：`provider = "xxx"` → 环境变量 `XXX_API_KEY` + `XXX_BASE_URL`（provider 名 uppercase）。

**为什么选 D 而不是显式声明 provider 表**：三处收益 —— TOML 只 1 行、`.env` 已经按此命名预置、想加新 provider 零 TOML 改动。代价是约定不写在 config 里，靠文档说明。可接受。

### 2. `.env` 加载

Node ≥ 20.12 内置 `process.loadEnvFile()`。**单点在 `src/config.ts` 顶层**加载，落在 imports 之后、`process.env` 首次读取之前：

```ts
try {
  const projectRootForEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.loadEnvFile(path.join(projectRootForEnv, ".env"));
} catch { /* .env 不存在或旧 Node 无 loadEnvFile → 静默 */ }
```

**为什么单点足够**：`config.ts` 是三条主入口链的共同祖先——

- `src/runner.ts` → `./config.js`
- `src/local-console/server.ts` → `./config.js`（间接经 `local-console/*` 与 `codex.js`）
- `desktop/src/main.ts` → `../../src/local-console/server.js` → `./config.js`

ES 模块导入语义保证：任何 `import "./config.js"` 都会先跑完 `config.ts` 的模块体，才继续本模块的导入或代码。所以只要 `config.ts` 顶层加载，一切下游 `process.env` 读取都已经能拿到 `.env` 里的变量。

**为什么不显式路径而是从 `import.meta.url` 上溯**：`process.cwd()` 在 Electron 桌面壳里不一定是项目根；用 `import.meta.url` 定位 `src/`，再上溯一级到项目根，稳定不依赖启动 cwd。

### 3. `CODEX_EXEC_OPTIONS` 拆分

现在（`src/config.ts:82`）：

```ts
export const CODEX_EXEC_OPTIONS = [
  "--yolo", "--json", "-m", "gpt-5.5",
  "-c", 'service_tier="fast"',
  "-c", "features.fast_mode=true",
  "-c", 'model_reasoning_effort="xhigh"',
] as const;
```

改为：

```ts
export const CODEX_EXEC_OPTIONS_BASE = [
  "--yolo", "--json", "-m", "gpt-5.5",
  "-c", 'service_tier="fast"',
  "-c", "features.fast_mode=true",
  "-c", 'model_reasoning_effort="xhigh"',
] as const;

export interface CodexProviderConfig {
  provider: string;
  baseUrl: string;   // 已从 process.env 展开的字面 URL
}

export function buildCodexExecOptions(cfg: CodexProviderConfig | null): string[] {
  if (!cfg) return [...CODEX_EXEC_OPTIONS_BASE];
  const name = cfg.provider;
  const upper = name.toUpperCase();
  return [
    ...CODEX_EXEC_OPTIONS_BASE,
    "-c", `model_provider=${name}`,
    "-c", `model_providers.${name}.name=${name}`,
    "-c", `model_providers.${name}.base_url=${cfg.baseUrl}`,
    "-c", `model_providers.${name}.env_key=${upper}_API_KEY`,
    "-c", `model_providers.${name}.wire_api=responses`,
  ];
}

export function resolveCodexProviderConfig(
  local: { codex?: { provider?: string } },
  env: NodeJS.ProcessEnv = process.env,
): CodexProviderConfig | null {
  const provider = local.codex?.provider?.trim();
  if (!provider) return null;
  const upper = provider.toUpperCase();
  const apiKey = env[`${upper}_API_KEY`];
  const baseUrl = env[`${upper}_BASE_URL`];
  const missing: string[] = [];
  if (!apiKey) missing.push(`${upper}_API_KEY`);
  if (!baseUrl) missing.push(`${upper}_BASE_URL`);
  if (missing.length) {
    throw new Error(
      `[codex] provider="${provider}" 需要环境变量 ${missing.join(", ")}，但未在 process.env 中找到；` +
      `请在项目根 .env 中设置或直接 export`,
    );
  }
  return { provider, baseUrl };
}
```

**关键点**：

- `env_key` 传变量名字面量（`TRANFU_API_KEY`），codex 子进程自己从进程环境读值。
- `base_url` 必须**在父进程展开成字面 URL**，`-c` 不认 shell 变量。
- `resolveCodexProviderConfig` 只做校验与解析，返回值给 `buildCodexExecOptions` 使用；缺环境变量在入口阶段抛可见错误，早失败。

### 4. `spawn` 显式传 env

`src/codex.ts:122`：

```ts
const child = spawn("codex", buildCodexArgs(prompt, mode, imagePaths), {
  cwd,
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
```

显式写 `env: process.env` 是防御性保护：现在缺省行为等价，但把契约钉住，防止后续有人加 `env: {...override}` 时把 `TRANFU_API_KEY` 无意屏蔽掉。

### 5. `buildCodexArgs` 从哪拿 provider config

方案：`buildCodexArgs` 顶层通过 lazy 模块级 getter 从 `LocalConfig` 解析一次并缓存，避免每次调用都 IO 读 TOML。伪代码：

```ts
let cachedExecOptions: readonly string[] | null = null;
function getExecOptions(): readonly string[] {
  if (cachedExecOptions) return cachedExecOptions;
  const local = loadLocalConfig();  // 同步读 config.toml/config.local.toml
  const provider = resolveCodexProviderConfig(local);
  cachedExecOptions = buildCodexExecOptions(provider);
  return cachedExecOptions;
}

export function buildCodexArgs(...) {
  const execOptions = getExecOptions();
  ...
}
```

测试通过 `buildCodexArgs(prompt, mode, imagePaths, { execOptions })` 可选入参绕过缓存注入，保持可测。

## 权衡与不做的事

- **NEVER 把 API key 打进 `-c` 命令行**：命令行会出现在 `ps aux` 里。key 只通过 env 传，`env_key=VAR_NAME` 让 codex 子进程去取。
- **NEVER 用 `--config` 或 `~/.codex/config.toml` 落 provider**：本 change 的目标就是**不改用户 codex 配置文件**，让切换可回退到零。
- **NEVER 抽象成多 provider 数组**：只支持"一次跑用一个 provider"。多 provider 并发不是本轮需求。
- **NEVER 在本轮引入 `model` 覆盖**：`gpt-5.5` 在 tranfu 通道存在；`derouter` 若模型名不同再单独抽。
- **NEVER 把 `wire_api` 变成可配**：codex 0.135 只支持 `responses`；`chat` 已删除。硬编码 `responses` 是唯一正确值。

## 风险与失败模式

- **父进程没加载 `.env`**：`resolveCodexProviderConfig` 会抛可见错误，不会隐性回落到订阅（避免"看起来跑了但走错了 provider"）。
- **provider 名有空格 / 特殊字符**：`.toUpperCase()` + `.trim()` 兜底；不做额外正则限制，交给 codex 报错。
- **`.env` 中变量名冲突（比如同时定义 `OPENAI_API_KEY` 与 `TRANFU_API_KEY`）**：codex 只读 `env_key` 指定的那个变量，其他不影响。
- **`process.loadEnvFile()` 覆盖已有 `process.env`**：Node 内置的行为是**不覆盖已存在的变量**（`shell export` 优先），符合直觉，无需额外处理。
