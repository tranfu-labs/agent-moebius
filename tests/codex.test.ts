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
      expect.arrayContaining(["exec", "--json", "-m", "gpt-5.5", "hello"]),
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

  it("does not fire idle while the process keeps producing output, then max-duration caps it", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-codex-test-"));
    const binDir = path.join(tempDir, "bin");
    const runDir = path.join(tempDir, "run");
    await fs.mkdir(binDir);
    const codexPath = path.join(binDir, "codex");
    await fs.writeFile(
      codexPath,
      `#!/usr/bin/env node
setInterval(() => {
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "command_execution" } }) + "\\n");
}, 100);
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
        maxDurationMs: 3_500,
        interruptTerminationDelayMs: 10,
        interruptKillDelayMs: 10,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("max-duration-timeout:3500ms");
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
