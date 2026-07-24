import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  AI_TEAM_BUILDER_CODEX_IDLE_TIMEOUT_MS,
  AI_TEAM_BUILDER_CODEX_MAX_DURATION_MS,
  CODEX_MODEL,
  CODEX_PROVIDER_CONFIG,
  buildTeamBuilderExecOptions,
} from "../../../src/config.js";
import {
  run as runCodex,
  type CodexRunOptions,
  type CodexRunResult,
} from "../../../src/codex.js";
import { isValidPathSegment } from "../team-model.js";
import { serializeAiTeamBuilderOutputSchema } from "./output-schema.js";

export const AI_TEAM_BUILDER_DEVELOPER_INSTRUCTIONS = `你是 moebius 的团队设计器，只负责把用户目标转成团队方案。
缺少会改变成员构成的关键信息时，只追问一个问题；信息足够时直接给方案。
方案必须包含 2–6 名成员、唯一主 Agent、唯一稳定 slug、每名成员的完整职责与交棒规格，以及一段可播放的接力示例。
不得读写文件、运行命令或声称团队已经创建。
只返回指定 schema；phase 只能是 clarifying 或 proposal。`;

export interface AiTeamBuilderCodexRequest {
  dataRoot: string;
  draftId: string;
  prompt: string;
  threadId: string | null;
  signal?: AbortSignal;
}

export type AiTeamBuilderCodexResult =
  | { ok: true; finalText: string; threadId: string }
  | { ok: false; reason: string; resumeFailed: boolean };

export interface AiTeamBuilderCodexSpawnerOptions {
  run?: (options: CodexRunOptions) => Promise<CodexRunResult>;
  model?: string;
}

export class AiTeamBuilderCodexSpawner {
  private readonly run: (options: CodexRunOptions) => Promise<CodexRunResult>;
  private readonly model: string;

  constructor(options: AiTeamBuilderCodexSpawnerOptions = {}) {
    this.run = options.run ?? runCodex;
    this.model = options.model ?? CODEX_MODEL;
  }

  async execute(request: AiTeamBuilderCodexRequest): Promise<AiTeamBuilderCodexResult> {
    assertDraftId(request.draftId);
    const runtimeRoot = path.join(
      path.resolve(request.dataRoot),
      ".state",
      "ai-team-builder-runtime",
      request.draftId,
    );
    const isolatedCwd = path.join(runtimeRoot, "workspace");
    const schemaPath = path.join(runtimeRoot, "output-schema.json");
    const runDir = path.join(runtimeRoot, "runs", randomUUID());
    await fs.mkdir(isolatedCwd, { recursive: true });
    await writeFileAtomically(schemaPath, serializeAiTeamBuilderOutputSchema());

    const mode = request.threadId === null
      ? { kind: "full" as const }
      : { kind: "resume" as const, threadId: request.threadId };
    const result = await this.run({
      prompt: request.prompt,
      runDir,
      mode,
      cwd: isolatedCwd,
      execOptions: buildTeamBuilderExecOptions({
        mode: mode.kind,
        schemaPath,
        isolatedCwd,
        developerInstructions: AI_TEAM_BUILDER_DEVELOPER_INSTRUCTIONS,
        providerConfig: CODEX_PROVIDER_CONFIG,
        model: this.model,
      }),
      idleTimeoutMs: AI_TEAM_BUILDER_CODEX_IDLE_TIMEOUT_MS,
      maxDurationMs: AI_TEAM_BUILDER_CODEX_MAX_DURATION_MS,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        resumeFailed: request.threadId !== null,
      };
    }
    const threadId = result.threadId ?? request.threadId;
    if (threadId === null) {
      return { ok: false, reason: "thread-id-missing", resumeFailed: false };
    }
    return { ok: true, finalText: result.finalText, threadId };
  }
}

function assertDraftId(draftId: string): void {
  if (!isValidPathSegment(draftId) || draftId.trim() !== draftId) {
    throw new AiTeamBuilderCodexError("Invalid AI team builder draft id.");
  }
}

async function writeFileAtomically(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporaryPath, content, "utf8");
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

export class AiTeamBuilderCodexError extends Error {
  readonly code = "AI_TEAM_BUILDER_CODEX_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AiTeamBuilderCodexError";
  }
}
