import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import {
  ConversationSidebar,
  type ConversationSidebarProject
} from "@/console/conversation-sidebar";

const projects: ConversationSidebarProject[] = [
  {
    id: "agent-moebius",
    path: "/Users/example/work/agent-moebius",
    sessions: [
      { id: "idle-refactor", title: "导出功能重构", status: "idle" },
      { id: "completed-docs", title: "文档归档", status: "completed", summary: "验收通过" },
      { id: "running-progress", title: "进度提示", status: "running", summary: "正在运行测试" },
      { id: "waiting-summary", title: "失败汇总", status: "waiting", summary: "等你验收" },
      { id: "completed-story", title: "Story 走查", status: "completed", summary: "已完成" },
      { id: "running-fix", title: "失败汇总修复", status: "running", summary: "开发执行中" }
    ]
  },
  {
    id: "tranfu-site",
    path: "/Users/example/work/tranfu-site/",
    sessions: [
      { id: "site-waiting", title: "首页文案", status: "waiting", summary: "提案等确认" },
      { id: "site-idle", title: "分享卡片", status: "idle" }
    ]
  }
];

const meta = {
  title: "Console/ConversationSidebar",
  component: ConversationSidebar,
  args: {
    projects,
    selectedSessionId: "running-progress"
  },
  parameters: {
    layout: "centered"
  }
} satisfies Meta<typeof ConversationSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SortedSessions: Story = {
  render: (args) => {
    const [selectedSessionId, setSelectedSessionId] = useState(args.selectedSessionId);

    return (
      <ConversationSidebar
        {...args}
        selectedSessionId={selectedSessionId}
        onSelectSession={(sessionId) => setSelectedSessionId(sessionId)}
        className="h-[460px]"
      />
    );
  }
};
