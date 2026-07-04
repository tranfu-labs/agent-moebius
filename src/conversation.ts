export function countMessages(commentCount: number): number {
  if (!Number.isInteger(commentCount) || commentCount < 0) {
    throw new Error("commentCount must be a non-negative integer");
  }

  return 1 + commentCount;
}

export interface AgentMention {
  name: string;
  index: number;
}

export interface TimelineComment {
  body: string;
}

export type TimelineSource = "issue-body" | "comment";

export interface TimelineMessage {
  index: number;
  speaker: string;
  body: string;
  source: TimelineSource;
}

export interface RoleThreadState {
  threadId: string;
  lastSeenIndex: number;
}

export type RolePromptPlan =
  | {
      kind: "run";
      mode: "full";
      role: string;
      prompt: string;
      latestIndex: number;
    }
  | {
      kind: "run";
      mode: "resume";
      role: string;
      threadId: string;
      prompt: string;
      latestIndex: number;
      deltaMessages: TimelineMessage[];
    }
  | {
      kind: "skip";
      reason: "empty-timeline" | "no-new-external-messages";
      role: string;
    };

export function buildTimeline(
  issueBody: string,
  comments: TimelineComment[],
  availableAgentNames: string[],
): TimelineMessage[] {
  return [
    {
      index: 0,
      speaker: "user",
      body: issueBody,
      source: "issue-body",
    },
    ...comments.map((comment, commentIndex) => {
      const normalized = normalizeComment(comment.body, availableAgentNames);
      return {
        index: commentIndex + 1,
        source: "comment" as const,
        ...normalized,
      };
    }),
  ];
}

export function getLatestTimelineMessage(timeline: TimelineMessage[]): TimelineMessage | null {
  return timeline[timeline.length - 1] ?? null;
}

export function formatAgentComment(role: string, finalText: string): string {
  return `&lt;${role}&gt;:\n${finalText.trimEnd()}\n\n<!-- agent-moebius:role=${role} -->`;
}

export function buildRolePromptPlan(input: {
  role: string;
  agentMarkdown: string;
  timeline: TimelineMessage[];
  state: RoleThreadState | null;
}): RolePromptPlan {
  const latestIndex = getLatestTimelineMessage(input.timeline)?.index;
  if (latestIndex === undefined) {
    return { kind: "skip", reason: "empty-timeline", role: input.role };
  }

  if (input.state === null) {
    return {
      kind: "run",
      mode: "full",
      role: input.role,
      latestIndex,
      prompt: buildFullPrompt(input.agentMarkdown, input.timeline),
    };
  }

  const deltaMessages = selectDeltaMessages(input.timeline, input.role, input.state.lastSeenIndex);
  if (deltaMessages.length === 0) {
    return { kind: "skip", reason: "no-new-external-messages", role: input.role };
  }

  return {
    kind: "run",
    mode: "resume",
    role: input.role,
    threadId: input.state.threadId,
    latestIndex,
    deltaMessages,
    prompt: buildDeltaPrompt(input.role, deltaMessages),
  };
}

export function buildFallbackFullPrompt(agentMarkdown: string, timeline: TimelineMessage[]): string {
  return buildFullPrompt(agentMarkdown, timeline);
}

export function selectDeltaMessages(
  timeline: TimelineMessage[],
  role: string,
  lastSeenIndex: number,
): TimelineMessage[] {
  return timeline.filter((message) => message.index > lastSeenIndex && message.speaker !== role);
}

export function resolveNextRoleThreadState(input: {
  currentThreadId: string | null;
  resultThreadId: string | null;
  latestIndex: number;
}): RoleThreadState | null {
  const threadId = input.resultThreadId ?? input.currentThreadId;
  if (threadId === null) {
    return null;
  }

  return {
    threadId,
    lastSeenIndex: input.latestIndex,
  };
}

export function parseAgentMentions(text: string): AgentMention[] {
  const mentions: AgentMention[] = [];
  const pattern = /(^|[^A-Za-z0-9_-])@([a-z0-9]+(?:-[a-z0-9]+)*)(?![A-Za-z0-9_-])/g;
  const mentionText = maskMarkdownBacktickCode(text);

  for (const match of mentionText.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const name = match[2];
    if (name === undefined || match.index === undefined) {
      continue;
    }

    mentions.push({
      name,
      index: match.index + prefix.length,
    });
  }

  return mentions;
}

function maskMarkdownBacktickCode(text: string): string {
  const chars = text.split("");
  maskFencedBacktickBlocks(text, chars);
  maskInlineBacktickCode(chars);
  return chars.join("");
}

function maskFencedBacktickBlocks(text: string, chars: string[]): void {
  let lineStart = 0;

  while (lineStart < text.length) {
    const fenceStart = findOpeningBacktickFence(text, lineStart);
    const lineEnd = findLineEnd(text, lineStart);

    if (fenceStart === null || fenceStart >= lineEnd) {
      lineStart = lineEnd + 1;
      continue;
    }

    const closeLineStart = findClosingBacktickFenceLine(text, lineEnd + 1);
    const maskEnd =
      closeLineStart === null ? text.length : Math.min(findLineEnd(text, closeLineStart) + 1, text.length);
    maskRange(chars, lineStart, maskEnd);
    lineStart = maskEnd;
  }
}

function findOpeningBacktickFence(text: string, lineStart: number): number | null {
  let cursor = lineStart;
  let spaces = 0;

  while (cursor < text.length && text[cursor] === " " && spaces < 3) {
    cursor += 1;
    spaces += 1;
  }

  return text.startsWith("```", cursor) ? cursor : null;
}

function findClosingBacktickFenceLine(text: string, start: number): number | null {
  let lineStart = start;

  while (lineStart < text.length) {
    if (findOpeningBacktickFence(text, lineStart) !== null) {
      return lineStart;
    }
    lineStart = findLineEnd(text, lineStart) + 1;
  }

  return null;
}

function findLineEnd(text: string, start: number): number {
  const newlineIndex = text.indexOf("\n", start);
  return newlineIndex === -1 ? text.length : newlineIndex;
}

function maskInlineBacktickCode(chars: string[]): void {
  let index = 0;

  while (index < chars.length) {
    if (chars[index] !== "`") {
      index += 1;
      continue;
    }

    const delimiterLength = countBacktickRun(chars, index);
    const endIndex = findInlineBacktickEnd(chars, index + delimiterLength, delimiterLength);
    if (endIndex === null) {
      index += delimiterLength;
      continue;
    }

    maskRange(chars, index, endIndex + delimiterLength);
    index = endIndex + delimiterLength;
  }
}

function countBacktickRun(chars: string[], start: number): number {
  let end = start;
  while (end < chars.length && chars[end] === "`") {
    end += 1;
  }

  return end - start;
}

function findInlineBacktickEnd(chars: string[], start: number, delimiterLength: number): number | null {
  for (let index = start; index < chars.length; index += 1) {
    if (chars[index] === "\n") {
      return null;
    }
    if (chars[index] === "`") {
      const runLength = countBacktickRun(chars, index);
      if (runLength === delimiterLength) {
        return index;
      }
      index += runLength - 1;
    }
  }

  return null;
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    chars[index] = chars[index] === "\n" ? "\n" : " ";
  }
}

export function selectMentionedAgent(text: string, availableAgentNames: string[]): string | null {
  const availableAgents = new Set(availableAgentNames);

  for (const mention of parseAgentMentions(text)) {
    if (availableAgents.has(mention.name)) {
      return mention.name;
    }
  }

  return null;
}

function normalizeComment(body: string, availableAgentNames: string[]): Pick<TimelineMessage, "speaker" | "body"> {
  const availableAgents = new Set(availableAgentNames);
  const metadataRole = parseMetadataRole(body);

  if (metadataRole !== null) {
    if (metadataRole === "ceo") {
      return {
        speaker: "ceo",
        body: stripRoleEnvelope(stripAgentMetadata(body), "ceo"),
      };
    }

    if (!availableAgents.has(metadataRole)) {
      return {
        speaker: "user",
        body,
      };
    }

    return {
      speaker: metadataRole,
      body: stripRoleEnvelope(stripAgentMetadata(body), metadataRole),
    };
  }

  const legacyRole = parseRoleEnvelopePrefix(body);
  if (legacyRole !== null && availableAgents.has(legacyRole)) {
    return {
      speaker: legacyRole,
      body: stripRoleEnvelope(body, legacyRole),
    };
  }

  return {
    speaker: "user",
    body,
  };
}

function parseMetadataRole(body: string): string | null {
  const match = body.match(/<!--\s*agent-moebius:role=([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/);
  return match?.[1] ?? null;
}

function parseRoleEnvelopePrefix(body: string): string | null {
  const rolePattern = "([a-z0-9]+(?:-[a-z0-9]+)*)";
  const match = body.match(
    new RegExp(`^(?:${rolePattern}|&lt;${rolePattern}&gt;|<${rolePattern}>):(?:\\s|\\r?\\n|$)`),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function stripAgentMetadata(body: string): string {
  return body.replace(/<!--\s*agent-moebius:role=[a-z0-9]+(?:-[a-z0-9]+)*\s*-->/g, "").trimEnd();
}

function stripRoleEnvelope(body: string, role: string): string {
  const escapedRole = escapeRegex(role);
  const pattern = new RegExp(`^(?:${escapedRole}|&lt;${escapedRole}&gt;|<${escapedRole}>):\\s*`);
  return body.replace(pattern, "").trim();
}

function buildFullPrompt(agentMarkdown: string, timeline: TimelineMessage[]): string {
  return `${agentMarkdown.trimEnd()}

你正在参与一个 GitHub Issue 共享时间线。请基于你的角色设定和公开时间线继续回复。
消息格式为 #<index> <speaker>: 后接正文。你的最终回复会由 runner 使用 <role>: 可见前缀写回 GitHub。

当前共享时间线：
${formatTimelineMessages(timeline)}`;
}

function buildDeltaPrompt(role: string, deltaMessages: TimelineMessage[]): string {
  return `以下是共享 GitHub Issue 时间线中，你上次处理后新增、且不是你自己 <${role}> 发出的消息。请基于你当前 Codex thread 的既有上下文继续回复。

新增公开消息：
${formatTimelineMessages(deltaMessages)}`;
}

function formatTimelineMessages(messages: TimelineMessage[]): string {
  return messages
    .map((message) => `#${message.index} <${message.speaker}>:\n${message.body.trimEnd()}`)
    .join("\n\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
