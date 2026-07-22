import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentInitialAvatar, agentInitialGlyph } from "./agent-initial-avatar";

describe("AgentInitialAvatar", () => {
  it("derives the glyph from display name before the stable slug", () => {
    expect(agentInitialGlyph(" 软件测试 ", "qa")).toBe("软");
    expect(agentInitialGlyph("ceo", "fallback")).toBe("C");
  });

  it("falls back to the uppercased slug initial when display name is unavailable", () => {
    expect(agentInitialGlyph("", "dev-manager")).toBe("D");
    expect(agentInitialGlyph("   ", "qa")).toBe("Q");
  });

  it("keeps the avatar decorative beside the readable member name", () => {
    const { container } = render(
      <div>
        <AgentInitialAvatar displayName="开发经理" slug="manager" />
        <span>开发经理</span>
      </div>,
    );

    expect(screen.getByText("开发经理")).toBeVisible();
    const avatar = container.querySelector('[data-agent-initial-avatar="manager"]');
    expect(avatar).toHaveTextContent("开");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
  });
});
