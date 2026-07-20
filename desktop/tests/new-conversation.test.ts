import { describe, expect, it, vi } from "vitest";
import { createConversationAndRecordTeam } from "../src/console-page/new-conversation.js";

describe("new conversation Agent team recording", () => {
  it("does not update the last-used record when session creation fails", async () => {
    const recordSuccessfulTeam = vi.fn();

    await expect(createConversationAndRecordTeam({
      projectId: "project-a",
      team: { teamId: "development", ownership: "system" },
      createSession: vi.fn().mockResolvedValue(null),
      recordSuccessfulTeam,
    })).resolves.toEqual({ created: false });

    expect(recordSuccessfulTeam).not.toHaveBeenCalled();
  });

  it("updates the record exactly once after session creation succeeds", async () => {
    const recordSuccessfulTeam = vi.fn().mockResolvedValue(undefined);

    await expect(createConversationAndRecordTeam({
      projectId: "project-a",
      team: { teamId: "my-team", ownership: "user" },
      createSession: vi.fn().mockResolvedValue({ sessionId: "local:created" }),
      recordSuccessfulTeam,
    })).resolves.toEqual({ created: true, preferenceRecorded: true });

    expect(recordSuccessfulTeam).toHaveBeenCalledTimes(1);
    expect(recordSuccessfulTeam).toHaveBeenCalledWith({
      sessionId: "local:created",
      teamId: "my-team",
      ownership: "user",
    });
  });

  it("keeps a successfully created conversation successful when preference persistence fails", async () => {
    const preferenceError = new Error("disk unavailable");

    await expect(createConversationAndRecordTeam({
      projectId: "project-a",
      team: { teamId: "development", ownership: "system" },
      createSession: vi.fn().mockResolvedValue({ sessionId: "local:created" }),
      recordSuccessfulTeam: vi.fn().mockRejectedValue(preferenceError),
    })).resolves.toEqual({ created: true, preferenceRecorded: false, preferenceError });
  });
});
