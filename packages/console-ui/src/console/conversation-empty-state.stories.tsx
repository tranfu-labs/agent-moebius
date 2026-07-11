import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { ConversationEmptyState } from "@/console/conversation-empty-state";

const meta = {
  title: "Console/ConversationEmptyState",
  component: ConversationEmptyState,
  args: {
    value: "",
    onValueChange: () => undefined
  },
  parameters: {
    layout: "centered"
  }
} satisfies Meta<typeof ConversationEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StartConversation: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);

    return <ConversationEmptyState {...args} value={value} onValueChange={setValue} />;
  }
};
