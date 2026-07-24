import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperatorAgentTeam } from "@/console/agent-teams-page";
import { RelayDemo } from "./relay-demo";
import { createRelayPlaybackTiming, parseRelayDurationToken } from "./relay-motion";

const developmentTeam: OperatorAgentTeam = {
  teamKey: "system:development",
  id: "development",
  ownership: "system",
  name: "开发团队",
  description: "把目标变成有证据的实现",
  primaryAgentSlug: "manager",
  memberOrder: ["manager", "developer", "qa"],
  onboardingOrchestration: {
    status: "ready",
    relayBeats: [
      { speakerSlug: "manager", message: "拆解任务并派工。" },
      { speakerSlug: "developer", message: "完成第一版实现。" },
      { speakerSlug: "qa", message: "复核发现边界问题。" },
      { speakerSlug: "developer", message: "修正边界问题。" },
      { speakerSlug: "qa", message: "第二轮复核通过。" },
      { speakerSlug: "manager", message: "带着证据收尾。" },
    ],
  },
  members: [
    { slug: "manager", displayName: "经理", description: "拆解并收尾" },
    { slug: "developer", displayName: "开发", description: "负责实现" },
    { slug: "qa", displayName: "测试", description: "负责复核" },
  ],
  status: "usable",
  canCreateConversation: true,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("RelayDemo", () => {
  it("keeps every connector within one beat and aligns graph and message rows", () => {
    renderDemo({ reducedMotion: true });

    const connectors = screen.getAllByTestId("relay-connector");
    expect(connectors).toHaveLength(5);
    for (const connector of connectors) {
      const y1 = Number(connector.getAttribute("data-y1"));
      const y2 = Number(connector.getAttribute("data-y2"));
      expect(y2 - y1).toBeLessThanOrEqual(1);
    }

    const nodeRows = screen.getAllByTestId("relay-node-row");
    const messageRows = screen.getAllByTestId("relay-message-row");
    expect(nodeRows).toHaveLength(messageRows.length);
    nodeRows.forEach((nodeRow, index) => {
      expect(nodeRow.getAttribute("data-grid-row")).toBe(
        messageRows[index]?.getAttribute("data-grid-row"),
      );
      expect((nodeRow as HTMLElement).style.gridRow).toBe(
        (messageRows[index] as HTMLElement).style.gridRow,
      );
    });
  });

  it("uses opacity-only progression for reduced motion", () => {
    vi.useFakeTimers();
    const animate = vi.fn();
    const originalAnimate = Object.getOwnPropertyDescriptor(window.Element.prototype, "animate");
    vi.stubGlobal("Element", window.Element);
    Object.defineProperty(window.Element.prototype, "animate", {
      configurable: true,
      value: animate,
    });

    const { container } = renderDemo({ reducedMotion: true });
    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId("onboarding-relay-demo-slot")).toHaveAttribute("data-motion", "reduced");
    expect(animate).not.toHaveBeenCalled();
    const renderedMarkup = container.innerHTML;
    expect(renderedMarkup).not.toMatch(/\b(?:transform|translate(?:X|Y)?)[\s:"'(-]/u);
    expect(screen.getAllByTestId("relay-message-row").every(
      (row) => row.getAttribute("data-visible") === "true",
    )).toBe(true);
    expect(screen.getByText("这支团队已带着复核证据完成接力。")).toBeInTheDocument();

    if (originalAnimate === undefined) {
      Reflect.deleteProperty(window.Element.prototype, "animate");
    } else {
      Object.defineProperty(window.Element.prototype, "animate", originalAnimate);
    }
    vi.unstubAllGlobals();
  });

  it("reads an AI team's relay metadata without branching on team id", () => {
    const aiTeam: OperatorAgentTeam = {
      ...developmentTeam,
      teamKey: "user:launch-team",
      id: "launch-team",
      ownership: "user",
      name: "发布团队",
      onboardingOrchestration: {
        status: "ready",
        relayBeats: [
          { speakerSlug: "manager", message: "锁定发布目标。" },
          { speakerSlug: "qa", message: "校验渠道与排期。" },
        ],
      },
    };

    render(
      <RelayDemo
        team={aiTeam}
        relayRun={1}
        reducedMotion
        onReplay={vi.fn()}
      />,
    );

    expect(screen.getByText("锁定发布目标。")).toBeInTheDocument();
    expect(screen.getByText("校验渠道与排期。")).toBeInTheDocument();
    expect(screen.getAllByTestId("relay-message-row")).toHaveLength(2);
  });

  it("isolates invalid relay metadata to a local unavailable state", () => {
    const invalidTeam: OperatorAgentTeam = {
      ...developmentTeam,
      onboardingOrchestration: {
        status: "ready",
        relayBeats: [{ speakerSlug: "missing", message: "不应静默降级。" }],
      },
    };

    render(
      <RelayDemo
        team={invalidTeam}
        relayRun={1}
        reducedMotion
        onReplay={vi.fn()}
      />,
    );

    expect(screen.getByText("暂无可播放的协作示例")).toBeInTheDocument();
    expect(screen.getByText("不影响这支团队的实际使用")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新播放" })).not.toBeInTheDocument();
  });

  it("allows onboarding to continue when orchestration is missing", () => {
    render(
      <RelayDemo
        team={{ ...developmentTeam, onboardingOrchestration: { status: "unavailable" } }}
        relayRun={1}
        reducedMotion
        onReplay={vi.fn()}
      />,
    );

    expect(screen.getByText("暂无可播放的协作示例")).toBeInTheDocument();
  });

  it("delegates replay and computes a standard duration in the 8-12 second window", () => {
    const onReplay = vi.fn();
    renderDemo({ onReplay });

    fireEvent.click(screen.getByRole("button", { name: "重新播放" }));

    expect(onReplay).toHaveBeenCalledOnce();
    expect(createRelayPlaybackTiming(4, false).totalDurationMs).toBe(8_000);
    expect(createRelayPlaybackTiming(6, false).totalDurationMs).toBe(10_200);
    expect(createRelayPlaybackTiming(10, false).totalDurationMs).toBe(12_000);
  });

  it("parses the shared motion duration token for WAAPI timing", () => {
    expect(parseRelayDurationToken("150ms", 99)).toBe(150);
    expect(parseRelayDurationToken("0.2s", 99)).toBe(200);
    expect(parseRelayDurationToken("", 99)).toBe(99);
  });
});

function renderDemo(overrides: Partial<{
  onReplay: () => void;
  reducedMotion: boolean;
}> = {}) {
  return render(
    <RelayDemo
      team={developmentTeam}
      relayRun={1}
      reducedMotion={overrides.reducedMotion}
      onReplay={overrides.onReplay ?? vi.fn()}
    />,
  );
}
