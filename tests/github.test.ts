import { describe, expect, it } from "vitest";
import {
  buildAddIssueReactionArgs,
  buildFetchIssueWithCommentsArgs,
  buildListOpenIssueSummariesArgs,
  buildPostCommentArgs,
  GitHubIssueNotFoundError,
  isGitHubIssueNotFoundError,
  isIssueNotFoundMessage,
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
      "body,comments,updatedAt",
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
    expect(buildAddIssueReactionArgs(source, "eyes")).toEqual([
      "api",
      "--method",
      "POST",
      "repos/tranfu-labs/agent-moebius/issues/4/reactions",
      "-f",
      "content=eyes",
    ]);
  });
});
