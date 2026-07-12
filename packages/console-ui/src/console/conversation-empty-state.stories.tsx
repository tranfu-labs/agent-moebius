import type { Meta, StoryObj } from "@storybook/react";

import { ConversationEmptyState } from "@/console/conversation-empty-state";

const meta = {
  title: "Console/ConversationEmptyState",
  component: ConversationEmptyState,
  args: {
    projectName: "agent-moebius",
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ConversationEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StartConversation: Story = {};
