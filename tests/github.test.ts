import { describe, expect, it } from "vitest";
import { GitHubIssueNotFoundError, isGitHubIssueNotFoundError, isIssueNotFoundMessage } from "../src/github.js";

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
});
