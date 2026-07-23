import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProcessEvent } from "./process-event";
import {
  ProcessTab,
  nextProcessTabTitle,
  resolveOperatorMemberName,
} from "./process-tab";

describe("ProcessTab", () => {
  it("shows the explicit Codex unavailable state without fallback output", () => {
    render(
      <div data-testid="scroll-parent">
        <ProcessTab
          title="开发"
          state={{
            status: "ready",
            output: {
              sessionId: "session-a",
              requestedRunId: "run-a",
              role: "dev",
              status: "unavailable",
              unavailableReason: "link-missing",
              attempts: [],
              events: [],
              previousCursor: null,
              appendCursor: null,
              atLatest: true,
            },
          }}
        />
      </div>,
    );

    expect(screen.getByText("Codex 过程记录文件已不可用")).toBeInTheDocument();
    expect(screen.getByText("这一步的最终回复仍保留在主对话区。")).toBeInTheDocument();
    expect(screen.queryByText("标准输出")).not.toBeInTheDocument();
    expect(screen.queryByText("保留记录")).not.toBeInTheDocument();
  });

  it("renders friendly public messages, tools, errors, and unsupported placeholders", () => {
    const { rerender } = render(
      <ProcessEvent
        memberName="开发"
        event={{
          key: "public-1",
          kind: "public-message",
          messageId: 1,
          speaker: "user",
          role: null,
          markdown: "**检查** 页面",
          attachments: [],
          timestamp: "2026-07-23T01:00:00.000Z",
        }}
      />,
    );
    expect(screen.getByText("你")).toBeInTheDocument();
    expect(screen.getByText("检查")).toBeInTheDocument();

    rerender(
      <ProcessEvent
        memberName="开发"
        event={{
          key: "tool-1",
          kind: "tool",
          timestamp: null,
          phase: "completed",
          name: "exec",
          input: "pnpm test",
          output: "PASS",
          status: "completed",
        }}
      />,
    );
    expect(screen.getByText("工具结果")).toBeInTheDocument();
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();

    rerender(
      <ProcessEvent
        memberName="开发"
        event={{
          key: "unsupported-1",
          kind: "unsupported",
          timestamp: null,
          eventType: "event_msg.future_event",
        }}
      />,
    );
    expect(screen.getByText(/暂不支持的过程事件/u)).toBeInTheDocument();
    expect(screen.getByText("event_msg.future_event")).toBeInTheDocument();
  });

  it("keeps stable member labels and monotonic duplicate titles", () => {
    expect(resolveOperatorMemberName("dev")).toBe("开发");
    expect(nextProcessTabTitle({
      tabs: [
        { type: "run-output", title: "开发" },
        { type: "run-output", title: "开发 2" },
        { type: "workspace-diff", title: "改动" },
      ],
    }, "dev")).toBe("开发 3");
  });

  it("keeps a large process history to a bounded viewport plus overscan DOM", () => {
    const events = Array.from({ length: 1_000 }, (_, index) => ({
      key: `agent-${String(index)}`,
      kind: "agent-markdown" as const,
      timestamp: `2026-07-23T01:${String(index % 60).padStart(2, "0")}:00.000Z`,
      markdown: `第 ${String(index + 1)} 条过程`,
    }));
    const { container } = render(
      <div style={{ height: 640, overflow: "auto" }}>
        <ProcessTab
          title="开发"
          state={{
            status: "ready",
            output: {
              sessionId: "session-a",
              requestedRunId: "run-a",
              role: "dev",
              status: "settled",
              unavailableReason: null,
              attempts: [],
              events,
              previousCursor: null,
              appendCursor: null,
              atLatest: true,
            },
          }}
        />
      </div>,
    );

    expect(container.querySelectorAll("[data-index]").length).toBeLessThan(30);
    expect(container.querySelectorAll("article").length).toBeLessThan(30);
  });
});
