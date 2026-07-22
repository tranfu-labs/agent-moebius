import { describe, expect, it, vi } from "vitest";
import {
  canSubmitNewConversation,
  createNewConversationDraft,
  reduceNewConversationDraft,
  submitNewConversation,
} from "../src/console-page/new-conversation.js";

describe("new conversation draft state machine", () => {
  it("allows drafting without a project but requires project, team, text, and an idle submit state", () => {
    const draft = createNewConversationDraft({ teamKey: "system:development", draft: "目标" });
    expect(draft).toEqual({
      projectId: null,
      teamKey: "system:development",
      draft: "目标",
      isSubmitting: false,
      error: null,
    });
    expect(canSubmitNewConversation(draft)).toBe(false);
    expect(canSubmitNewConversation({ ...draft, projectId: "project-a" })).toBe(true);
    expect(canSubmitNewConversation({ ...draft, projectId: "project-a", isSubmitting: true })).toBe(false);
  });

  it("owns project, team, text, and submission transitions outside the app shell", () => {
    const opened = reduceNewConversationDraft(null, {
      type: "open",
      draft: createNewConversationDraft({ teamKey: "system:development", draft: "" }),
    });
    const withProject = reduceNewConversationDraft(opened, { type: "select-project", projectId: "project-a" });
    const withTeam = reduceNewConversationDraft(withProject, { type: "select-team", teamKey: "user:custom" });
    const withText = reduceNewConversationDraft(withTeam, { type: "edit-draft", draft: "保留的目标" });
    const submitting = reduceNewConversationDraft(withText, { type: "submit-started" });
    const failed = reduceNewConversationDraft(submitting, { type: "submit-failed", error: "请重试" });

    expect(failed).toEqual({
      projectId: "project-a",
      teamKey: "user:custom",
      draft: "保留的目标",
      isSubmitting: false,
      error: "请重试",
    });
    expect(reduceNewConversationDraft(failed, { type: "close" })).toBeNull();
    expect(reduceNewConversationDraft(null, { type: "edit-draft", draft: "ignored" })).toBeNull();
  });

  it("does not update the last-used record when session creation fails", async () => {
    const recordSuccessfulTeam = vi.fn();

    await expect(submitNewConversation({
      projectId: "project-a",
      initialMessage: "first message",
      team: { teamId: "development", ownership: "system" },
      createSessionWithFirstMessage: vi.fn().mockResolvedValue(null),
      recordSuccessfulTeam,
    })).resolves.toEqual({ created: false });

    expect(recordSuccessfulTeam).not.toHaveBeenCalled();
  });

  it("updates the record exactly once after session creation succeeds", async () => {
    const recordSuccessfulTeam = vi.fn().mockResolvedValue(undefined);
    const createSessionWithFirstMessage = vi.fn().mockResolvedValue({ sessionId: "local:created" });

    await expect(submitNewConversation({
      projectId: "project-a",
      initialMessage: "first message",
      team: { teamId: "my-team", ownership: "user" },
      createSessionWithFirstMessage,
      recordSuccessfulTeam,
    })).resolves.toEqual({ created: true, sessionId: "local:created", preferenceRecorded: true });

    expect(recordSuccessfulTeam).toHaveBeenCalledTimes(1);
    expect(recordSuccessfulTeam).toHaveBeenCalledWith({
      sessionId: "local:created",
      teamId: "my-team",
      ownership: "user",
    });
    expect(createSessionWithFirstMessage).toHaveBeenCalledWith(
      "project-a",
      "first message",
      { teamId: "my-team", ownership: "user" },
    );
  });

  it("keeps a successfully created conversation successful when preference persistence fails", async () => {
    const preferenceError = new Error("disk unavailable");

    await expect(submitNewConversation({
      projectId: "project-a",
      initialMessage: "first message",
      team: { teamId: "development", ownership: "system" },
      createSessionWithFirstMessage: vi.fn().mockResolvedValue({ sessionId: "local:created" }),
      recordSuccessfulTeam: vi.fn().mockRejectedValue(preferenceError),
    })).resolves.toEqual({ created: true, sessionId: "local:created", preferenceRecorded: false, preferenceError });
  });
});
