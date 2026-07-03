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

describe("parseCeoOutput", () => {
  it("parses no_change JSON", () => {
    expect(parseCeoOutput('{"action":"no_change"}')).toEqual({ kind: "no_change" });
  });

  it("parses no_change JSON wrapped in fenced code block", () => {
    expect(parseCeoOutput('```json\n{"action":"no_change"}\n```')).toEqual({ kind: "no_change" });
  });

  it("parses replace JSON with body", () => {
    expect(parseCeoOutput('{"action":"replace","body":"hello"}')).toEqual({ kind: "replace", body: "hello" });
  });

  it("parses append JSON with as and body", () => {
    expect(parseCeoOutput('{"action":"append","as":"ceo","body":"hi"}')).toEqual({
      kind: "append",
      as: "ceo",
      body: "hi",
    });
  });

  it("returns invalid_json for non-JSON output", () => {
    const parsed = parseCeoOutput("this is not json");
    expect(parsed.kind).toBe("invalid_json");
  });

  it("returns invalid_json for JSON array", () => {
    const parsed = parseCeoOutput("[1,2,3]");
    expect(parsed.kind).toBe("invalid_json");
  });

  it("returns unknown_action for unknown action value", () => {
    const parsed = parseCeoOutput('{"action":"delete","body":"x"}');
    expect(parsed.kind).toBe("unknown_action");
  });
});

describe("formatCeoComment", () => {
  it("replaces a missing marker response when CEO returns a valid repair", async () => {
    const agentsDir = await makeAgentsDir();
    const repairedBody = `> CEO guardrail: 已补齐发布契约。

我已完成验证，测试通过。

<!-- agent-moebius:stage=code-verified -->`;
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: JSON.stringify({ action: "replace", body: repairedBody }),
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

  it("returns APPEND when CEO decides to add an independent comment as=ceo", async () => {
    const agentsDir = await makeAgentsDir();
    const appendBody = `> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。

@dev 同意你提出的分支方案，请自行创建并继续推进 plan-written。`;
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: JSON.stringify({ action: "append", as: "ceo", body: appendBody }),
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, agentsDir, runCodex });

    expect(result).toMatchObject({
      action: "APPEND",
      as: "ceo",
      reason: "appended",
    });
    if (result.action === "APPEND") {
      expect(result.body).toBe(appendBody);
    }
  });

  it("documents CEO stage acceptance routing in the persona", async () => {
    const persona = await fs.readFile(path.resolve("agents", "ceo.md"), "utf8");

    expect(persona).toContain("回流给发起需求角色验收");
    expect(persona).toContain("缺验收语句时要求补齐");
    expect(persona).toContain("mention `@dev`");
    expect(persona).toContain("mention 该发起角色");
  });

  it("returns APPEND when CEO routes plan-written acceptance back to hermes-user", async () => {
    const agentsDir = await makeAgentsDir();
    const latestResponse = `方案已落盘。

## 验收语句
1. 跑 pnpm test -- tests/format-ceo.test.ts → 应退出码 0。

<!-- agent-moebius:stage=plan-written -->`;
    const appendBody =
      "@hermes-user 请按本轮方案末尾的「验收语句」逐条验收方案：每条给出通过 / 不通过 + 依据。";
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: JSON.stringify({ action: "append", as: "ceo", body: appendBody }),
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({
      ...baseInput,
      issueContext: {
        issueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/34",
        issueBody: "需求持有者是 hermes-user。\n@dev 请实现验收回流路由。",
        comments: [],
      },
      latestResponse,
      agentsDir,
      runCodex,
    });

    expect(result).toMatchObject({
      action: "APPEND",
      as: "ceo",
      reason: "appended",
    });
    if (result.action === "APPEND") {
      expect(result.body).toContain("@hermes-user");
      expect(result.body).toContain("验收语句");
      expect(result.body).toContain("逐条验收");
    }
    const prompt = runCodex.mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("需求持有者是 hermes-user");
    expect(prompt).toContain("<!-- agent-moebius:stage=plan-written -->");
    expect(prompt).toContain("## 验收语句");
  });

  it("returns APPEND when CEO asks dev to add missing acceptance statements", async () => {
    const agentsDir = await makeAgentsDir();
    const latestResponse = `方案已落盘，但这里只写了泛泛说明。

<!-- agent-moebius:stage=plan-written -->`;
    const appendBody =
      "@dev 当前 `plan-written` 缺少可逐条核查的「验收语句」清单，请先补齐验收语句后再回流给验收角色。";
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: JSON.stringify({ action: "append", as: "ceo", body: appendBody }),
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({
      ...baseInput,
      latestResponse,
      agentsDir,
      runCodex,
    });

    expect(result).toMatchObject({
      action: "APPEND",
      as: "ceo",
      reason: "appended",
    });
    if (result.action === "APPEND") {
      expect(result.body).toContain("@dev");
      expect(result.body).toContain("缺少");
      expect(result.body).toContain("补齐验收语句");
    }
  });

  it("returns APPEND with as=dev when CEO impersonates dev", async () => {
    const agentsDir = await makeAgentsDir();
    const appendBody = `> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。

我按 change/foo 分支方案自行推进 plan-written。

<!-- agent-moebius:stage=in-progress -->`;
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: JSON.stringify({ action: "append", as: "dev", body: appendBody }),
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, agentsDir, runCodex });

    expect(result).toMatchObject({
      action: "APPEND",
      as: "dev",
    });
    if (result.action === "APPEND") {
      expect(result.body).toContain("<!-- agent-moebius:stage=in-progress -->");
    }
  });

  it("returns APPEND with as=dev-manager when CEO speaks as the tech lead", async () => {
    const agentsDir = await makeAgentsDir();
    const appendBody = `> CEO guardrail: 技术选型属于 dev-manager 裁决范围。

我确认当前架构决策并要求写码方按质量门推进。

<!-- agent-moebius:stage=in-progress -->`;
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: JSON.stringify({ action: "append", as: "dev-manager", body: appendBody }),
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, agentsDir, runCodex });

    expect(result).toMatchObject({
      action: "APPEND",
      as: "dev-manager",
    });
  });

  it("returns APPEND with as=secretary when CEO delegates rule maintenance", async () => {
    const agentsDir = await makeAgentsDir();
    const appendBody = `> CEO guardrail: 这属于 CEO 规则进化事项。

我会采访并维护 CEO guardrail 规则。

<!-- agent-moebius:stage=in-progress -->`;
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: JSON.stringify({ action: "append", as: "secretary", body: appendBody }),
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, agentsDir, runCodex });

    expect(result).toMatchObject({
      action: "APPEND",
      as: "secretary",
    });
  });

  it("returns the original body when CEO says no_change", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '```json\n{"action":"no_change"}\n```',
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

  it("passes full public issue context to CEO prompt", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '{"action":"no_change"}',
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    await formatCeoComment({
      ...baseInput,
      issueContext: {
        issueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/20",
        issueBody: "全局流程：先采访再方案",
        comments: [
          { body: "临时修改：本次不需要额外 token 统计" },
          {
            body: "&lt;reflector&gt;:\n@dev 请反思\n<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=7 -->",
          },
        ],
      },
      latestResponse: "我准备发布的最新响应",
      agentsDir,
      runCodex,
    });

    const prompt = runCodex.mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("完整公开 issue 上下文");
    expect(prompt).toContain("latestResponse 是本轮唯一待发布的 agent 响应");
    expect(prompt).toContain("issueContext.issueUrl:");
    expect(prompt).toContain("https://github.com/tranfu-labs/agent-moebius/issues/20");
    expect(prompt).toContain("issueContext.issueBody:");
    expect(prompt).toContain("全局流程：先采访再方案");
    expect(prompt).toContain("#1 comment:");
    expect(prompt).toContain("临时修改：本次不需要额外 token 统计");
    expect(prompt).toContain("#2 comment:");
    expect(prompt).toContain("stage-hook source=dev stage=plan-written");
    expect(prompt).toContain("latestResponse:");
    expect(prompt).toContain("我准备发布的最新响应");
    expect(prompt).not.toContain("lastReflectorHook:");
    expect(prompt).not.toContain("originalRequest:");
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

  it("fail-opens when CEO returns non-JSON output", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: "自然语言而不是 JSON",
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({ action: "FAIL_OPEN", body: "原文", reason: "invalid-json" });
  });

  it("fail-opens when CEO returns an unknown action", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '{"action":"delete","body":"x"}',
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({ action: "FAIL_OPEN", body: "原文", reason: "unknown-action" });
  });

  it("fail-opens when append.as is not in allowed set", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '{"action":"append","as":"nobody","body":"..."}',
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({ action: "FAIL_OPEN", body: "原文", reason: "unknown-as" });
  });

  it("fail-opens when append.as is the removed reflector role", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '{"action":"append","as":"reflector","body":"..."}',
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({ action: "FAIL_OPEN", body: "原文", reason: "unknown-as" });
  });

  it("fail-opens when append body is empty", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '{"action":"append","as":"ceo","body":"   "}',
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({ action: "FAIL_OPEN", body: "原文", reason: "empty-body" });
  });

  it("fail-opens when replace body lacks a valid trailing stage marker", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '{"action":"replace","body":"修正版但没有 marker"}',
      threadId: "ceo-thread",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const result = await formatCeoComment({ ...baseInput, latestResponse: "原文", agentsDir, runCodex });

    expect(result).toMatchObject({ action: "FAIL_OPEN", body: "原文", reason: "post-validate-failed" });
  });

  it("fail-opens when replace body stage marker is outside AllStages", async () => {
    const agentsDir = await makeAgentsDir();
    const runCodex = vi.fn(async (options: Parameters<NonNullable<FormatCeoInput["runCodex"]>>[0]) => ({
      ok: true as const,
      finalText: '{"action":"replace","body":"修正版\\n<!-- agent-moebius:stage=done -->"}',
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
    ).resolves.toMatchObject({ action: "FAIL_OPEN", reason: "invalid-json" });
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
  issueContext: {
    issueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/4",
    issueBody: "@dev please fix",
    comments: [],
  },
  latestResponse: "done\n<!-- agent-moebius:stage=in-progress -->",
  runDir: path.join(os.tmpdir(), "agent-moebius-ceo-test"),
};

async function makeAgentsDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-agents-"));
  await fs.writeFile(path.join(dir, "ceo.md"), "CEO persona", "utf8");
  return dir;
}
