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
      { id: "running-fix", title: "失败汇总修复", status: "running", createdAt: "2026-07-11T10:05:00.000Z", summary: "开发执行中" },
      { id: "docs-history", title: "文档归档记录", status: "idle", createdAt: "2026-07-11T10:04:00.000Z" },
      { id: "waiting-summary", title: "失败汇总", status: "waiting", createdAt: "2026-07-11T10:03:00.000Z", summary: "等你验收" },
      { id: "running-progress", title: "进度提示", status: "running", createdAt: "2026-07-11T10:02:00.000Z", summary: "正在运行测试" },
      { id: "idle-refactor", title: "导出功能重构", status: "idle", createdAt: "2026-07-11T10:01:00.000Z" }
    ]
  },
  {
    id: "tranfu-site",
    path: "/Users/example/work/tranfu-site/",
    sessions: [
      { id: "site-waiting", title: "首页文案", status: "waiting", createdAt: "2026-07-11T10:01:00.000Z", summary: "提案等确认" },
      { id: "site-idle", title: "分享卡片", status: "idle", createdAt: "2026-07-11T10:00:00.000Z" }
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

export const NewestSessionsFirst: Story = {
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
