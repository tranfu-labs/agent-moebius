import type { Meta, StoryObj } from "@storybook/react";

import { AgentMessage } from "@/console/agent-message";

const rawMarkdown = [
  "## 结论",
  "消息、运行块和错误结局已按 Linear 扁平语言拆成独立组件。",
  "",
  "## 依据",
  "- packages/console-ui/src/console/agent-message.tsx",
  "- packages/console-ui/src/console/run-block.tsx",
  "",
  "## 下一步",
  "交棒：@qa 请按验收语句走查",
  "",
  "<!-- agent-moebius:stage=plan-written -->",
].join("\n");

const meta = {
  title: "Console/AgentMessage",
  component: AgentMessage,
  args: {
    role: "dev",
    rawMarkdown,
    timestamp: "09:36",
  },
} satisfies Meta<typeof AgentMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Expanded: Story = {
  args: {
    defaultOpen: true,
  },
};

export const ExplicitOverrides: Story = {
  args: {
    stage: "code-verified",
    conclusion: "显式字段优先显示，原始 Markdown 仍完整保留。",
    handoff: "交给「产品」确认验收",
  },
};
