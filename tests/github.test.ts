import { describe, expect, it } from "vitest";
import {
  buildAddReactionArgs,
  buildAddIssueReactionArgs,
  buildCreateIssueArgs,
  buildFetchIssueStateArgs,
  buildFetchIssueWithCommentsArgs,
  buildFindIssueByOrchestrationKeyArgs,
  buildListOpenIssueSummariesArgs,
  buildPostCommentArgs,
  GitHubIssueNotFoundError,
  isGitHubIssue,
  isGitHubIssueNotFoundError,
  isIssueNotFoundMessage,
  runCommand,
} from "../src/github.js";
import { makeIssueSource } from "../src/issue-source.js";

describe("github issue errors", () => {
  it("classifies GitHub issue number not found errors", () => {
    expect(
      isIssueNotFoundMessage(
        "GraphQL: Could not resolve to an issue or pull request with the number of 4. (repository.issue)",
      ),
    ).toBe(true);
  });

  it("does not classify unrelated gh failures as issue not found", () => {
    expect(isIssueNotFoundMessage("HTTP 401: Bad credentials")).toBe(false);
  });

  it("identifies GitHubIssueNotFoundError instances", () => {
    const error = new GitHubIssueNotFoundError("tranfu-labs/agent-moebius#4", "missing");

    expect(isGitHubIssueNotFoundError(error)).toBe(true);
    expect(isGitHubIssueNotFoundError(new Error("missing"))).toBe(false);
  });

  it("builds safe gh argument arrays for issue summary discovery", () => {
    expect(buildListOpenIssueSummariesArgs({ owner: "tranfu-labs", repo: "agent-moebius" }, 20)).toEqual([
      "issue",
      "list",
      "--repo",
      "tranfu-labs/agent-moebius",
      "--state",
      "open",
      "--limit",
      "20",
      "--json",
      "number,updatedAt",
    ]);
  });

  it("builds safe gh argument arrays for issue detail fetch and comments", () => {
    const source = makeIssueSource({ owner: "tranfu-labs", repo: "agent-moebius", issueNumber: 4 });

    expect(buildFetchIssueWithCommentsArgs(source)).toEqual([
      "issue",
      "view",
      "4",
      "--repo",
      "tranfu-labs/agent-moebius",
      "--json",
      "body,comments,updatedAt,state",
    ]);
    expect(buildFetchIssueStateArgs(source)).toEqual([
      "issue",
      "view",
      "4",
      "--repo",
      "tranfu-labs/agent-moebius",
      "--json",
      "state",
    ]);
    expect(buildPostCommentArgs(source)).toEqual([
      "issue",
      "comment",
      "4",
      "--repo",
      "tranfu-labs/agent-moebius",
      "--body-file",
      "-",
    ]);
    expect(buildCreateIssueArgs(source, "title with $(rm -rf /)\nand newline")).toEqual([
      "issue",
      "create",
      "--repo",
      "tranfu-labs/agent-moebius",
      "--title",
      "title with $(rm -rf /)\nand newline",
      "--body-file",
      "-",
    ]);
    expect(buildFindIssueByOrchestrationKeyArgs(source, "agent-moebius-orchestration-key:abc")).toEqual([
      "issue",
      "list",
      "--repo",
      "tranfu-labs/agent-moebius",
      "--state",
      "all",
      "--search",
      "agent-moebius-orchestration-key:abc",
      "--json",
      "number,url",
    ]);
    expect(buildAddIssueReactionArgs(source, "eyes")).toEqual([
      "api",
      "--method",
      "POST",
      "repos/tranfu-labs/agent-moebius/issues/4/reactions",
      "-f",
      "content=eyes",
    ]);
    expect(buildAddReactionArgs({ kind: "issue", source }, "eyes")).toEqual([
      "api",
      "--method",
      "POST",
      "repos/tranfu-labs/agent-moebius/issues/4/reactions",
      "-f",
      "content=eyes",
    ]);
    expect(buildAddReactionArgs({ kind: "issue-comment", source, commentId: "IC_kwDOTGDJNs8AAAABIUjPpQ" }, "eyes")).toEqual([
      "api",
      "graphql",
      "-f",
      "query=mutation($subjectId: ID!, $content: ReactionContent!) { addReaction(input: {subjectId: $subjectId, content: $content}) { reaction { content } } }",
      "-f",
      "subjectId=IC_kwDOTGDJNs8AAAABIUjPpQ",
      "-f",
      "content=EYES",
    ]);
  });

  it("accepts GitHub issue shapes with OPEN or CLOSED state and rejects unknown states", () => {
    const baseIssue = {
      body: "@dev",
      updatedAt: "2026-07-01T00:00:00Z",
      comments: [{ id: "comment-1", body: "hello" }],
    };

    expect(isGitHubIssue({ ...baseIssue, state: "OPEN" })).toBe(true);
    expect(isGitHubIssue({ ...baseIssue, state: "CLOSED" })).toBe(true);
    expect(isGitHubIssue({ ...baseIssue, state: "MERGED" })).toBe(false);
    expect(isGitHubIssue(baseIssue)).toBe(false);
    expect(isGitHubIssue({ ...baseIssue, state: "OPEN", comments: [{ body: "missing id" }] })).toBe(false);
  });

  it("terminates a hanging gh command attempt after its timeout", async () => {
    await expect(
      runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
        retry: false,
        timeoutMs: 20,
        terminationGraceMs: 10,
      }),
    ).rejects.toThrow(/timed out after 20ms/);
  });
});
