export function countMessages(commentCount: number): number {
  if (!Number.isInteger(commentCount) || commentCount < 0) {
    throw new Error("commentCount must be a non-negative integer");
  }

  return 1 + commentCount;
}

export function buildPrompt(agentMarkdown: string, issueBody: string, commentBodies: string[]): string {
  return [agentMarkdown, issueBody, ...commentBodies].join("\n\n");
}

export interface AgentMention {
  name: string;
  index: number;
}

export function getLatestMessage(issueBody: string, commentBodies: string[]): string {
  return commentBodies.length === 0 ? issueBody : commentBodies[commentBodies.length - 1] ?? issueBody;
}

export function parseAgentMentions(text: string): AgentMention[] {
  const mentions: AgentMention[] = [];
  const pattern = /(^|[^A-Za-z0-9_-])@([a-z0-9]+(?:-[a-z0-9]+)*)(?![A-Za-z0-9_-])/g;

  for (const match of text.matchAll(pattern)) {
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

export function selectMentionedAgent(text: string, availableAgentNames: string[]): string | null {
  const availableAgents = new Set(availableAgentNames);

  for (const mention of parseAgentMentions(text)) {
    if (availableAgents.has(mention.name)) {
      return mention.name;
    }
  }

  return null;
}
