import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationEmptyState } from "./conversation-empty-state";

describe("ConversationEmptyState", () => {
  it("renders a Codex-style project invitation without a nested composer", () => {
    render(<ConversationEmptyState projectName="agent-moebius" />);

    expect(screen.getByRole("heading", { name: "想在 agent-moebius 中完成什么？" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
