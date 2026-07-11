# 设计：codex-model-upgrade-5-6-sol

## 方案

### 数据流

```
config.local.toml
  └─ [codex]
       ├─ provider?  (已存在)
       └─ model?     (本轮新增)
       │
       ▼ src/local-config.ts::parseLocalConfig
LocalConfig.codex: { provider?, model? }
       │
       ▼ src/config.ts 顶层
resolveCodexProviderConfig(LOCAL_CONFIG)  → CodexProviderConfig | null   (不动)
resolveCodexModel(LOCAL_CONFIG)           → string                       (新)
       │
       ▼
buildCodexExecOptions(providerCfg, model)
       │
       ▼
CODEX_EXEC_OPTIONS  ── 供 src/codex.ts::buildCodexArgs 使用
```

### `src/local-config.ts` 改动

```ts
export interface CodexLocalConfig {
  provider?: string;
  model?: string; // 新
}
```

- `parseLocalConfig` 里既有 `result.codex = provider === undefined ? {} : { provider: provider.trim() }` 的 provider-only 分支改为把 `provider` 和 `model` 都读进来 trim（都可选）。
- `isCodexShape` 白名单：`"provider"` → `["provider", "model"]`；两个键都独立按 `undefined | 非空字符串` 校验（空字符串在这里 shape 通过，交给上层"空白回落默认"处理）。为保留原有可见错误路径，非字符串仍在 `isCodexShape` 内拒绝。
- 未知键仍被拒绝（回归保护）。

### `src/config.ts` 改动

```ts
export const DEFAULT_CODEX_MODEL = "gpt-5.6-sol";

export function resolveCodexModel(
  local: { codex?: { model?: string } },
): string {
  const raw = local.codex?.model;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : DEFAULT_CODEX_MODEL;
}

export function buildCodexExecOptionsBase(model: string): string[] {
  return [
    "--yolo",
    "--json",
    "-m",
    model,
    "-c",
    'service_tier="fast"',
    "-c",
    "features.fast_mode=true",
    "-c",
    'model_reasoning_effort="xhigh"',
  ];
}

export function buildCodexExecOptions(
  cfg: CodexProviderConfig | null,
  model: string,
): string[] {
  const base = buildCodexExecOptionsBase(model);
  if (cfg === null) return base;
  const { provider, baseUrl } = cfg;
  const upper = provider.toUpperCase();
  return [
    ...base,
    "-c",
    `model_provider=${provider}`,
    "-c",
    `model_providers.${provider}.name=${provider}`,
    "-c",
    `model_providers.${provider}.base_url=${baseUrl}`,
    "-c",
    `model_providers.${provider}.env_key=${upper}_API_KEY`,
    "-c",
    `model_providers.${provider}.wire_api=responses`,
  ];
}

export const CODEX_PROVIDER_CONFIG = resolveCodexProviderConfig(LOCAL_CONFIG);
export const CODEX_MODEL = resolveCodexModel(LOCAL_CONFIG);
export const CODEX_EXEC_OPTIONS = buildCodexExecOptions(CODEX_PROVIDER_CONFIG, CODEX_MODEL);
```

`CODEX_EXEC_OPTIONS_BASE` 常量导出（`as const` 数组）**移除**，改为 `buildCodexExecOptionsBase(model)` 函数导出。这不是仅内部——`tests/codex.test.ts` 目前从 `src/config` 导入 `CODEX_EXEC_OPTIONS_BASE` 做 baseline 断言，测试要跟着改成调用函数得到期望数组。

## 权衡

- **抽配置 vs 继续硬编码**：archive 的 `codex-provider-override` 当时明说"模型名本轮不抽"，是因为 tranfu 通道也叫 `gpt-5.5`、没必要引入配置面。这一轮升级本身就要动这个字面量，同时抽成配置——增量成本很低（一个 model 字段 + 一个 resolve 函数），换来的是"下次改模型名不用发 PR 改常量"。
- **`_BASE` 常量 → 函数**：模型名要参数化，最自然的做法是把整个 baseline 数组构建成函数。保留 `_BASE` 常量做默认拼装再局部替换 index 3 也可以，但可读性差、也难覆盖测试。函数版清晰。
- **默认值放常量而非环境变量**：`DEFAULT_CODEX_MODEL` 就是这一次升级要"刻在代码里"的默认，运行时并没有第二种默认场景。放 env 反而给部署面增负担。
- **空白回落 vs 报错**：与 `provider` 的语义对齐——空白视为未设置，用默认。避免用户把 model 键留空导致启动失败。

## 风险

- **测试全绿但真跑 codex CLI 时被拒**：`gpt-5.6-sol` 是否被订阅账户或 API provider 认账不在 CI 校验范围内。属于运行时环境问题，出错时用户会看到 codex CLI 自身的错误消息，覆盖到"降级到 5.5 或换 provider"即可。这次变更不引入自动回退，因为静默回退会掩盖账户/provider 侧的真实问题。
- **`CODEX_EXEC_OPTIONS_BASE` 常量下游依赖**：全仓 grep 只有 `src/config.ts` 定义 + `tests/codex.test.ts` 导入两处；改成函数后同步测试即可，无第三方消费者。
- **`isCodexShape` 白名单放宽误伤**：只加 `model` 一个键，仍然拒绝未知键；已有单测覆盖白名单拒绝路径。

## 回滚

- 反向 revert：将 `DEFAULT_CODEX_MODEL` 改回 `"gpt-5.5"`、shape 白名单收回 `"provider"`、`buildCodexExecOptionsBase` 换回 `CODEX_EXEC_OPTIONS_BASE` 常量数组，并把 spec/AGENTS 的模型名字面量改回。所有改动是本地文件替换，无 migration、无外部状态。
