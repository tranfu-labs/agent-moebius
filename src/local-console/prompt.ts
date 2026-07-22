import type { TimelineMessage } from "../conversation.js";

export function buildLocalAgentPrompt(input: {
  role: string;
  agentMarkdown: string;
  timeline: readonly TimelineMessage[];
  primaryAgent: string;
  availableAgentNames: readonly string[];
}): string {
  const roster = input.availableAgentNames.map((name) => `@${name}`).join("、");
  return `${input.agentMarkdown.trimEnd()}

本地团队上下文：
- 当前环境是本地对话 session。
- 当前团队主 Agent：@${input.primaryAgent}
- 当前可用成员：${roster}
- 合法的 @成员 表示把下一步控制权交给该成员。
- 如果你不是主 Agent且没有明确的下一位专业成员，请把控制权交回 @${input.primaryAgent}。
- 如果你是主 Agent，请结合完整时间线自由决定继续派工、询问用户或给出不含成员 mention 的可见收尾。
- 不要根据“验收”“通过”“不通过”等自然语言猜测或声明程序状态；这些词只表达专业判断。

当前本地对话时间线：
${formatLocalTimeline(input.timeline)}`;
}

function formatLocalTimeline(messages: readonly TimelineMessage[]): string {
  return messages
    .map((message) => `#${message.index} <${message.speaker}>:\n${message.body.trimEnd()}`)
    .join("\n\n");
}
