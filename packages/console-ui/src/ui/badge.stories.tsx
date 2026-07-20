import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "@/ui/badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  args: {
    children: "2 运行中",
    variant: "running"
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["idle", "running", "waiting", "pending", "completed", "displayed", "failed", "stuck", "interrupted"]
    }
  }
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ConsoleStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3.5">
      <Badge variant="running">运行中</Badge>
      <Badge variant="waiting">等待真人</Badge>
      <Badge variant="pending">排队中</Badge>
      <Badge variant="failed">错误</Badge>
      <Badge variant="stuck">卡住</Badge>
      <Badge variant="interrupted">已中断</Badge>
      <Badge variant="completed">已完成</Badge>
      <Badge variant="displayed">已显示</Badge>
      <Badge variant="idle">空闲</Badge>
    </div>
  )
};
