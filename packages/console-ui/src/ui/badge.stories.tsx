import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "@/ui/badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  args: {
    children: "2 运行中",
    variant: "neutral"
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["neutral", "selected", "accent", "pass", "danger"]
    }
  }
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ConsoleStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>2 运行中</Badge>
      <Badge variant="selected">1 等你</Badge>
      <Badge variant="pass">通过</Badge>
      <Badge variant="danger">不通过</Badge>
    </div>
  )
};
