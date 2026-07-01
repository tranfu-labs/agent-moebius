import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CEO_CORRECTED_METADATA,
  formatCeoComment,
  parseCeoOutput,
  type FormatCeoInput,
} from "../src/format-ceo.js";

describe("formatCeoComment", () => {
  it("accepts NO_CHANGE with whitespace or markdown fences", () => {
    expect(parseCeoOutput("  NO_CHANGE\n")).toEqual({ kind: "NO_CHANGE" });
    expect(parseCeoOutput("```text\nNO_CHANGE\n```")).toEqual({ kind: "NO_CHANGE" });
  });

  it("replaces a missing marker response when CEO returns a valid repair", async () => {
    const agentsDir = await makeAgentsDir();
    const repaired = `我已完成验证，测试通过。

> CEO guardrail: 已补齐发布契约，使评论能继续被 runner 识别。

<!-- agent-moebius:stage=code-verified -->`;
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: repaired,
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({
      ...baseInput,
      latestResponse: "我已完成验证，测试通过。",
      agentsDir,
      runCodex,
    });

    expect(result.action).toBe("REPLACE");
    expect(result.body).toContain("我已完成验证，测试通过。");
    expect(result.body).toContain("> CEO guardrail:");
    expect(result.body).toContain("<!-- agent-moebius:stage=code-verified -->");
    expect(result.body.endsWith(CEO_CORRECTED_METADATA)).toBe(true);
  });

  it("covers the issue 10 missing code-verified marker accident body", async () => {
    const agentsDir = await makeAgentsDir();
    const repaired = `${ISSUE_10_ACCIDENT_COMMENT}

> CEO guardrail: 已补齐发布契约，使评论能继续被 runner 识别。

<!-- agent-moebius:stage=code-verified -->`;
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: repaired,
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({
      ...baseInput,
      latestResponse: ISSUE_10_ACCIDENT_COMMENT,
      agentsDir,
      runCodex,
    });

    expect(result.action).toBe("REPLACE");
    expect(result.body).toContain("已做 `code-verified` 反思。");
    expect(result.body).toContain("GitHub reaction 通过 adapter 的 argv 参数数组调用");
    expect(result.body).toContain("> CEO guardrail:");
    expect(result.body).toContain("<!-- agent-moebius:stage=code-verified -->");
    expect(result.body.endsWith(CEO_CORRECTED_METADATA)).toBe(true);
  });

  it("returns the original body when CEO says NO_CHANGE", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: "```text\nNO_CHANGE\n```",
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, agentsDir, runCodex });

    expect(result).toMatchObject({
      action: "NO_CHANGE",
      body: baseInput.latestResponse,
      reason: "ceo-no-change",
    });
  });

  it("does not invoke CEO again for already corrected text", async () => {
    const runCodex = vi.fn();
    const latestResponse = `done

${CEO_CORRECTED_METADATA}`;

    const result = await formatCeoComment({ ...baseInput, latestResponse, runCodex });

    expect(result).toMatchObject({
      action: "NO_CHANGE",
      body: latestResponse,
      reason: "already-corrected",
    });
    expect(runCodex).not.toHaveBeenCalled();
  });

  it("fail-opens when CEO repair lacks a valid trailing marker", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: "修正版但没有 marker",
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({
      action: "FAIL_OPEN",
      body: "原文",
      reason: "post-validate-failed",
    });
  });

  it("fail-opens when CEO returns a stage outside AllStages", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: "修正版\n<!-- agent-moebius:stage=done -->",
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({ action: "FAIL_OPEN", body: "原文", reason: "post-validate-failed" });
  });

  it("fail-opens when CEO throws, times out, or returns empty text", async () => {
    const agentsDir = await makeAgentsDir();
    await expect(
      formatCeoComment({
        ...baseInput,
        agentsDir,
        runCodex: async () => {
          throw new Error("boom");
        },
      }),
    ).resolves.toMatchObject({ action: "FAIL_OPEN", reason: "codex-failed" });

    await expect(
      formatCeoComment({
        ...baseInput,
        agentsDir,
        timeoutMs: 1,
        runCodex: () => new Promise(() => {}),
      }),
    ).resolves.toMatchObject({ action: "FAIL_OPEN", reason: "codex-timeout" });

    await expect(
      formatCeoComment({
        ...baseInput,
        agentsDir,
        runCodex: async (options) => ({
          ok: true as const,
          finalText: "",
          threadId: "ceo-thread",
          cachedInputTokens: null,
          runDir: options.runDir,
          stdoutPath: path.join(options.runDir, "stdout.jsonl"),
          stderrPath: path.join(options.runDir, "stderr.log"),
        }),
      }),
    ).resolves.toMatchObject({ action: "FAIL_OPEN", reason: "empty-output" });
  });

  it("aborts the CEO Codex run when timeout fires", async () => {
    const agentsDir = await makeAgentsDir();
    let signal: AbortSignal | undefined;

    const result = await formatCeoComment({
      ...baseInput,
      agentsDir,
      timeoutMs: 1,
      runCodex: (options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    });

    expect(result).toMatchObject({ action: "FAIL_OPEN", reason: "codex-timeout" });
    expect(signal?.aborted).toBe(true);
  });
});

const baseInput: Omit<FormatCeoInput, "agentsDir" | "runCodex"> = {
  agent: "dev",
  originalRequest: "@dev please fix",
  latestResponse: "done\n<!-- agent-moebius:stage=in-progress -->",
  lastReflectorHook: null,
  runDir: path.join(os.tmpdir(), "agent-moebius-ceo-test"),
};

async function makeAgentsDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-agents-"));
  await fs.writeFile(path.join(dir, "ceo.md"), "CEO persona", "utf8");
  return dir;
}

const ISSUE_10_ACCIDENT_COMMENT = `&lt;dev&gt;:
已做 \`code-verified\` 反思。

结论：实现与方案一致，没有发现需要回到代码阶段修补的问题。

核对结果：

- reaction 添加点在真实 Codex driver 前，且在 prompt plan run 与 preScript 成功之后。
- no-trigger、stage hook、preScript 失败、prompt plan skip 都不会添加 reaction。
- resume fallback 不会重复添加 reaction，因为 reaction 只在首次 \`runCodex\` 前执行一次。
- reaction 失败只记录 \`codex-execution-reaction-failed\`，不会阻断 Codex，也不会改变既有状态推进条件。
- GitHub reaction 通过 adapter 的 argv 参数数组调用，没有把 issue 内容拼进 shell。
- 单测和 typecheck 已覆盖并通过。

仍停在 \`code-verified\` 后，等待归档/提交/开 PR 的下一步指示。

<!-- agent-moebius:role=dev -->`;
