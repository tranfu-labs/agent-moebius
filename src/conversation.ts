export function countMessages(commentCount: number): number {
  if (!Number.isInteger(commentCount) || commentCount < 0) {
    throw new Error("commentCount must be a non-negative integer");
  }

  return 1 + commentCount;
}

export function shouldRespond(count: number, maxRespondedCount: number): boolean {
  return count % 2 === 1 && count > maxRespondedCount;
}

export function buildPrompt(agentMarkdown: string, issueBody: string, commentBodies: string[]): string {
  return [agentMarkdown, issueBody, ...commentBodies].join("\n\n");
}
