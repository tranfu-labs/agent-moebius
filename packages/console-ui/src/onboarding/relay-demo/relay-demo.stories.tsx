import type { Meta, StoryObj } from "@storybook/react";

import type { OperatorAgentTeam } from "@/console/agent-teams-page";
import { RelayDemo } from "./relay-demo";

const developmentTeam: OperatorAgentTeam = {
  teamKey: "system:development",
  id: "development",
  ownership: "system",
  name: "开发团队",
  description: "负责软件方案、实现、测试、复核和主理收尾",
  primaryAgentSlug: "dev-manager",
  memberOrder: ["dev-manager", "dev", "qa"],
  onboardingOrchestration: {
    status: "ready",
    relayBeats: [
      { speakerSlug: "dev-manager", message: "我先拆出计算口径、边界样本和回归证据，开发先定位并提交修复。" },
      { speakerSlug: "dev", message: "已修正暂停区间的重复计入，并补上基础回归用例。" },
      { speakerSlug: "qa", message: "第一轮复核未通过：跨日运行仍有一分钟偏差。" },
      { speakerSlug: "dev", message: "已统一跨日取整口径并加入午夜边界用例。" },
      { speakerSlug: "qa", message: "第二轮复核通过：暂停、跨日和取整边界都已覆盖。" },
      { speakerSlug: "dev-manager", message: "收尾：两轮复核及通过证据都保留在时间线中。" },
    ],
  },
  members: [
    { slug: "dev-manager", displayName: "开发经理", description: "负责拆解和收尾" },
    { slug: "dev", displayName: "开发", description: "负责实现" },
    { slug: "qa", displayName: "软件测试", description: "负责复核" },
  ],
  status: "usable",
  canCreateConversation: true,
};

const meta = {
  title: "Onboarding/RelayDemo",
  component: RelayDemo,
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-lg">
        <Story />
      </div>
    ),
  ],
  args: {
    team: developmentTeam,
    relayRun: 1,
    onReplay: () => undefined,
  },
} satisfies Meta<typeof RelayDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};

export const ReducedMotion: Story = {
  args: {
    reducedMotion: true,
  },
};
