import type { Meta, StoryObj } from "@storybook/react";

import { NewConversationPage } from "./new-conversation-page";

const meta = {
  title: "Console/NewConversationPage",
  component: NewConversationPage,
  parameters: { layout: "fullscreen" },
  args: {
    projects: [
      { projectId: "a", title: "agent-moebius", available: true, workspaceLabel: "默认工作空间", branchLabel: "main" },
      { projectId: "b", title: "marketing-site", available: true, workspaceLabel: "独立工作空间", branchLabel: "agent/demo" },
    ],
    teams: [{ teamKey: "system:development", label: "开发团队" }],
    selectedProjectId: null,
    selectedTeamKey: "system:development",
    draft: "",
    onSelectProject: () => undefined,
    onAddProject: () => undefined,
    onSelectTeam: () => undefined,
    onDraftChange: () => undefined,
    onSubmit: () => undefined,
  },
} satisfies Meta<typeof NewConversationPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectUnselected: Story = {};

export const ProjectSelected: Story = {
  args: { selectedProjectId: "a", draft: "帮我完善新用户引导" },
};
