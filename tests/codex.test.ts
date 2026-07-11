import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildCodexArgs,
  codexTimeoutKind,
  createRunWatchdogs,
  extractCodexOutput,
  extractFinalAssistant,
  isInterruptedCodexRunResult,
  run,
} from "../src/codex.js";
import {
  DEFAULT_CODEX_MODEL,
  buildCodexExecOptions,
  buildCodexExecOptionsBase,
  resolveCodexModel,
  resolveCodexProviderConfig,
} from "../src/config.js";
import { parseLocalConfig } from "../src/local-config.js";

describe("extractFinalAssistant", () => {
  it("returns the final assistant text across supported event shapes", () => {
    const lines = [
      JSON.stringify({ type: "agent_message", message: "first" }),
      JSON.stringify({ type: "assistant_message", content: "second" }),
      JSON.stringify({ type: "message", role: "assistant", text: "third" }),
    ];

    expect(extractFinalAssistant(lines)).toBe("third");
  });

  it("skips invalid JSON lines", () => {
    const lines = [
      "not json",
      JSON.stringify({ type: "agent_message", message: "first" }),
      "{",
      JSON.stringify({ type: "assistant_message", text: "last" }),
    ];

    expect(extractFinalAssistant(lines)).toBe("last");
  });

  it("supports nested assistant message content arrays", () => {
    const lines = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "output_text", text: "hello" },
            { type: "output_text", text: " world" },
          ],
        },
      }),
    ];

    expect(extractFinalAssistant(lines)).toBe("hello world");
  });

  it("supports codex item.completed agent message events", () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "thread" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_0",
          type: "agent_message",
          text: "final from codex",
        },
      }),
    ];

    expect(extractFinalAssistant(lines)).toBe("final from codex");
  });

  it("extracts thread id and cached input tokens from codex jsonl", () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          cached_input_tokens: 42,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "final",
        },
      }),
    ];

    expect(extractCodexOutput(lines)).toEqual({
      finalText: "final",
      threadId: "thread-123",
      cachedInputTokens: 42,
    });
  });

  it("builds full and resume codex args without ephemeral mode", () => {
    expect(buildCodexArgs("hello")).toEqual(
      expect.arrayContaining(["exec", "--json", "-m", "gpt-5.6-sol", "hello"]),
    );
    expect(buildCodexArgs("hello")).not.toContain("--ephemeral");

    expect(buildCodexArgs("delta", { kind: "resume", threadId: "thread-1" })).toEqual(
      expect.arrayContaining(["exec", "resume", "--json", "thread-1", "delta"]),
    );
    expect(buildCodexArgs("delta", { kind: "resume", threadId: "thread-1" })).not.toContain("--ephemeral");
  });

  it("adds image attachments to full and resume codex args", () => {
    expect(buildCodexArgs("hello", { kind: "full" }, ["/tmp/a.png", "/tmp/b.jpg"])).toEqual(
      expect.arrayContaining(["--image", "/tmp/a.png", "--image", "/tmp/b.jpg", "hello"]),
    );

    expect(buildCodexArgs("delta", { kind: "resume", threadId: "thread-1" }, ["/tmp/a.png"])).toEqual(
      expect.arrayContaining(["exec", "resume", "--image", "/tmp/a.png", "thread-1", "delta"]),
    );
  });

  // 回归：codex exec 的 --image 是贪婪多值选项，若 prompt 直接跟在 --image 之后会被
  // 吞成图片路径，codex 转而读空 stdin 并以 exit 1 退出（"No prompt provided via stdin."）。
  // 必须用 "--" 终止选项解析，且位置参数（threadId / prompt）必须排在所有选项之后。
  it("terminates option parsing with -- so greedy --image cannot swallow the prompt", () => {
    const fullArgs = buildCodexArgs("hello", { kind: "full" }, ["/tmp/a.png", "/tmp/b.jpg"]);
    expect(fullArgs.slice(-2)).toEqual(["--", "hello"]);
    expect(fullArgs[fullArgs.indexOf("--") - 1]).toBe("/tmp/b.jpg");

    const resumeArgs = buildCodexArgs("delta", { kind: "resume", threadId: "thread-1" }, ["/tmp/a.png"]);
    expect(resumeArgs.slice(-3)).toEqual(["--", "thread-1", "delta"]);
    expect(resumeArgs[resumeArgs.indexOf("--") - 1]).toBe("/tmp/a.png");

    // 无图片时同样保留 "--"，兼容以 "-" 开头的 prompt。
    expect(buildCodexArgs("-starts-with-dash").slice(-2)).toEqual(["--", "-starts-with-dash"]);
  });

  it("returns null when no assistant message is present", () => {
    const lines = [
      JSON.stringify({ type: "message", role: "user", content: "hello" }),
      JSON.stringify({ type: "event", text: "not an assistant message" }),
    ];

    expect(extractFinalAssistant(lines)).toBeNull();
  });

  it("returns interrupted without parsing partial output when aborted", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-codex-test-"));
    const binDir = path.join(tempDir, "bin");
    const runDir = path.join(tempDir, "run");
    await fs.mkdir(binDir);
    const codexPath = path.join(binDir, "codex");
    await fs.writeFile(
      codexPath,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "agent_message", message: "stale" }) + "\\n");
setInterval(() => {}, 1000);
`,
      "utf8",
    );
    await fs.chmod(codexPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
    const controller = new AbortController();
    try {
      const pending = run({ prompt: "hello", runDir, signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 20));
      controller.abort("new-message");
      const result = await pending;

      expect(result.ok).toBe(false);
      expect(isInterruptedCodexRunResult(result)).toBe(true);
      if (!result.ok) {
        expect(result.reason).toBe("interrupted:new-message");
      }
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("escalates aborted codex child processes to SIGKILL when they ignore graceful signals", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-codex-test-"));
    const binDir = path.join(tempDir, "bin");
    const runDir = path.join(tempDir, "run");
    await fs.mkdir(binDir);
    const codexPath = path.join(binDir, "codex");
    await fs.writeFile(
      codexPath,
      `#!/usr/bin/env node
process.on("SIGINT", () => {});
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
      "utf8",
    );
    await fs.chmod(codexPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
    const controller = new AbortController();
    try {
      const pending = run({
        prompt: "hello",
        runDir,
        signal: controller.signal,
        interruptTerminationDelayMs: 10,
        interruptKillDelayMs: 10,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      controller.abort("codex-run-timeout:20ms");
      const result = await pending;

      expect(result.ok).toBe(false);
      expect(isInterruptedCodexRunResult(result)).toBe(true);
      if (!result.ok) {
        expect(result.reason).toBe("interrupted:codex-run-timeout:20ms");
      }
    } finally {
      process.env.PATH = previousPath;
    }
  });
});

describe("codex provider override", () => {
  it("subscription baseline: null provider returns byte-for-byte equal to base flags with default model", () => {
    const baseline = [
      "--yolo",
      "--json",
      "-m",
      "gpt-5.6-sol",
      "-c",
      'service_tier="fast"',
      "-c",
      "features.fast_mode=true",
      "-c",
      'model_reasoning_effort="xhigh"',
    ];
    expect(buildCodexExecOptionsBase(DEFAULT_CODEX_MODEL)).toEqual(baseline);
    expect(buildCodexExecOptions(null, DEFAULT_CODEX_MODEL)).toEqual(baseline);
    expect(resolveCodexProviderConfig({}, {})).toBeNull();
    expect(resolveCodexProviderConfig({ codex: {} }, {})).toBeNull();
    expect(resolveCodexProviderConfig({ codex: { provider: "" } }, {})).toBeNull();
    expect(resolveCodexProviderConfig({ codex: { provider: "   " } }, {})).toBeNull();
  });

  it("api mode appends exactly five provider overrides in order with literal base_url", () => {
    const cfg = resolveCodexProviderConfig(
      { codex: { provider: "tranfu" } },
      { TRANFU_API_KEY: "sk-xxx", TRANFU_BASE_URL: "https://api.tranfu.com/v1" },
    );
    expect(cfg).toEqual({ provider: "tranfu", baseUrl: "https://api.tranfu.com/v1" });

    const base = buildCodexExecOptionsBase(DEFAULT_CODEX_MODEL);
    const options = buildCodexExecOptions(cfg, DEFAULT_CODEX_MODEL);
    expect(options.slice(0, base.length)).toEqual(base);
    expect(options.slice(base.length)).toEqual([
      "-c",
      "model_provider=tranfu",
      "-c",
      "model_providers.tranfu.name=tranfu",
      "-c",
      "model_providers.tranfu.base_url=https://api.tranfu.com/v1",
      "-c",
      "model_providers.tranfu.env_key=TRANFU_API_KEY",
      "-c",
      "model_providers.tranfu.wire_api=responses",
    ]);
    // NEVER 允许把 key 值本身写进任何 argv 项。
    expect(options.every((entry) => !entry.includes("sk-xxx"))).toBe(true);
    // base_url MUST 是字面 URL，不能是 shell 变量占位符。
    expect(options.some((entry) => entry.includes("${TRANFU_BASE_URL}"))).toBe(false);
  });

  it("throws a visible error naming missing env variables and never returns", () => {
    expect(() =>
      resolveCodexProviderConfig({ codex: { provider: "tranfu" } }, { TRANFU_API_KEY: "sk-xxx" }),
    ).toThrow(/TRANFU_BASE_URL/);
    expect(() =>
      resolveCodexProviderConfig({ codex: { provider: "tranfu" } }, { TRANFU_BASE_URL: "https://api.tranfu.com/v1" }),
    ).toThrow(/TRANFU_API_KEY/);
    expect(() => resolveCodexProviderConfig({ codex: { provider: "tranfu" } }, {})).toThrow(
      /TRANFU_API_KEY.*TRANFU_BASE_URL/,
    );
    // 命名约定：provider name uppercase 得到 env 变量前缀。
    expect(() => resolveCodexProviderConfig({ codex: { provider: "derouter" } }, {})).toThrow(
      /DEROUTER_API_KEY.*DEROUTER_BASE_URL/,
    );
  });
});

describe("codex model override", () => {
  it("defaults to gpt-5.6-sol when [codex] is absent or model is unset/blank", () => {
    expect(DEFAULT_CODEX_MODEL).toBe("gpt-5.6-sol");
    expect(resolveCodexModel({})).toBe("gpt-5.6-sol");
    expect(resolveCodexModel({ codex: {} })).toBe("gpt-5.6-sol");
    expect(resolveCodexModel({ codex: { model: "" } })).toBe("gpt-5.6-sol");
    expect(resolveCodexModel({ codex: { model: "   " } })).toBe("gpt-5.6-sol");
  });

  it("uses the trimmed non-empty [codex].model literal as the -m value", () => {
    expect(resolveCodexModel({ codex: { model: "gpt-5.6-sol-preview" } })).toBe("gpt-5.6-sol-preview");
    expect(resolveCodexModel({ codex: { model: "  gpt-5.5  " } })).toBe("gpt-5.5");
    const options = buildCodexExecOptions(null, "gpt-5.6-sol-preview");
    const mIndex = options.indexOf("-m");
    expect(mIndex).toBeGreaterThanOrEqual(0);
    expect(options[mIndex + 1]).toBe("gpt-5.6-sol-preview");
  });

  it("provider and model are independent: both apply without interaction", () => {
    const cfg = resolveCodexProviderConfig(
      { codex: { provider: "tranfu", model: "gpt-5.6-sol-preview" } },
      { TRANFU_API_KEY: "sk-xxx", TRANFU_BASE_URL: "https://api.tranfu.com/v1" },
    );
    const model = resolveCodexModel({ codex: { provider: "tranfu", model: "gpt-5.6-sol-preview" } });
    expect(model).toBe("gpt-5.6-sol-preview");
    const options = buildCodexExecOptions(cfg, model);
    const base = buildCodexExecOptionsBase("gpt-5.6-sol-preview");
    expect(options.slice(0, base.length)).toEqual(base);
    expect(options.slice(base.length)).toEqual([
      "-c",
      "model_provider=tranfu",
      "-c",
      "model_providers.tranfu.name=tranfu",
      "-c",
      "model_providers.tranfu.base_url=https://api.tranfu.com/v1",
      "-c",
      "model_providers.tranfu.env_key=TRANFU_API_KEY",
      "-c",
      "model_providers.tranfu.wire_api=responses",
    ]);
  });

  it("parseLocalConfig rejects non-string [codex].model", () => {
    expect(() => parseLocalConfig(`[codex]\nmodel = 123\n`, "test")).toThrow(/Invalid local config shape/);
    expect(() => parseLocalConfig(`[codex]\nmodel = true\n`, "test")).toThrow(/Invalid local config shape/);
  });

  it("parseLocalConfig rejects unknown keys under [codex] (regression on shape whitelist)", () => {
    expect(() => parseLocalConfig(`[codex]\nextra = "x"\n`, "test")).toThrow(/Invalid local config shape/);
  });

  it("parseLocalConfig accepts model alone, provider alone, and both together", () => {
    const modelOnly = parseLocalConfig(`[codex]\nmodel = "gpt-5.6-sol-preview"\n`, "test");
    expect(modelOnly.codex).toEqual({ model: "gpt-5.6-sol-preview" });

    const providerOnly = parseLocalConfig(`[codex]\nprovider = "tranfu"\n`, "test");
    expect(providerOnly.codex).toEqual({ provider: "tranfu" });

    const both = parseLocalConfig(`[codex]\nprovider = "tranfu"\nmodel = "gpt-5.6-sol-preview"\n`, "test");
    expect(both.codex).toEqual({ provider: "tranfu", model: "gpt-5.6-sol-preview" });
  });
});

describe("createRunWatchdogs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires idle once after the idle window elapses without activity", () => {
    vi.useFakeTimers();
    const fired: string[] = [];
    createRunWatchdogs({ idleTimeoutMs: 1_000, onTimeout: (kind) => fired.push(kind) });

    vi.advanceTimersByTime(999);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fired).toEqual(["idle"]);
    vi.advanceTimersByTime(10_000);
    expect(fired).toEqual(["idle"]);
  });

  it("resets the idle countdown on every activity", () => {
    vi.useFakeTimers();
    const fired: string[] = [];
    const watchdogs = createRunWatchdogs({ idleTimeoutMs: 1_000, onTimeout: (kind) => fired.push(kind) });

    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(900);
      watchdogs.recordActivity();
    }
    expect(fired).toEqual([]);

    vi.advanceTimersByTime(1_000);
    expect(fired).toEqual(["idle"]);
  });

  it("fires max-duration regardless of activity", () => {
    vi.useFakeTimers();
    const fired: string[] = [];
    const watchdogs = createRunWatchdogs({
      idleTimeoutMs: 1_000,
      maxDurationMs: 3_000,
      onTimeout: (kind) => fired.push(kind),
    });

    for (let i = 0; i < 6; i += 1) {
      vi.advanceTimersByTime(500);
      watchdogs.recordActivity();
    }
    expect(fired).toEqual(["max-duration"]);
  });

  it("never fires after clear", () => {
    vi.useFakeTimers();
    const fired: string[] = [];
    const watchdogs = createRunWatchdogs({
      idleTimeoutMs: 1_000,
      maxDurationMs: 3_000,
      onTimeout: (kind) => fired.push(kind),
    });

    watchdogs.clear();
    vi.advanceTimersByTime(10_000);
    expect(fired).toEqual([]);
  });
});

describe("codexTimeoutKind", () => {
  it("classifies watchdog reasons and rejects everything else", () => {
    expect(codexTimeoutKind("idle-timeout:600000ms")).toBe("idle");
    expect(codexTimeoutKind("max-duration-timeout:7200000ms")).toBe("max-duration");
    expect(codexTimeoutKind("interrupted:new-message")).toBeNull();
    expect(codexTimeoutKind("exit-code-1")).toBeNull();
  });
});

describe("run watchdogs", () => {
  it("kills a silent codex process and returns idle-timeout", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-codex-test-"));
    const binDir = path.join(tempDir, "bin");
    const runDir = path.join(tempDir, "run");
    await fs.mkdir(binDir);
    const codexPath = path.join(binDir, "codex");
    await fs.writeFile(
      codexPath,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "agent_message", message: "warming up" }) + "\\n");
setInterval(() => {}, 1000);
`,
      "utf8",
    );
    await fs.chmod(codexPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await run({
        prompt: "hello",
        runDir,
        idleTimeoutMs: 100,
        interruptTerminationDelayMs: 10,
        interruptKillDelayMs: 10,
      });

      expect(result.ok).toBe(false);
      expect(isInterruptedCodexRunResult(result)).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("idle-timeout:100ms");
      }
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("caps a still-running process with max-duration before the idle deadline", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-codex-test-"));
    const binDir = path.join(tempDir, "bin");
    const runDir = path.join(tempDir, "run");
    await fs.mkdir(binDir);
    const codexPath = path.join(binDir, "codex");
    await fs.writeFile(
      codexPath,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "command_execution" } }) + "\\n");
setInterval(() => {
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "command_execution" } }) + "\\n");
}, 50);
`,
      "utf8",
    );
    await fs.chmod(codexPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await run({
        prompt: "hello",
        runDir,
        idleTimeoutMs: 2_000,
        maxDurationMs: 800,
        interruptTerminationDelayMs: 10,
        interruptKillDelayMs: 10,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("max-duration-timeout:800ms");
      }
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("settles in bounded time even when a grandchild keeps the stdio pipes open", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-codex-test-"));
    const binDir = path.join(tempDir, "bin");
    const runDir = path.join(tempDir, "run");
    await fs.mkdir(binDir);
    const codexPath = path.join(binDir, "codex");
    // codex 假进程无视温和信号，并派生一个持有继承 stdio 管道的孙进程：
    // SIGKILL 杀掉 codex 后 close 事件因孙进程持管道而不触发，验证强制 settle 兜底。
    await fs.writeFile(
      codexPath,
      `#!/usr/bin/env node
const { spawn } = require("node:child_process");
spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 3000)"], {
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
});
process.on("SIGINT", () => {});
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
      "utf8",
    );
    await fs.chmod(codexPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
    try {
      const startedAt = Date.now();
      const result = await run({
        prompt: "hello",
        runDir,
        idleTimeoutMs: 100,
        interruptTerminationDelayMs: 10,
        interruptKillDelayMs: 10,
      });

      expect(Date.now() - startedAt).toBeLessThan(2_000);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("idle-timeout:100ms");
      }
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
