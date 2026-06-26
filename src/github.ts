import { spawn } from "node:child_process";
import { ISSUE_NUMBER, OWNER, REPO } from "./config.js";

export interface GitHubComment {
  body: string;
}

export interface GitHubIssue {
  body: string;
  comments: GitHubComment[];
}

export async function fetchIssueWithComments(): Promise<GitHubIssue> {
  const result = await runCommand("gh", [
    "issue",
    "view",
    String(ISSUE_NUMBER),
    "--repo",
    `${OWNER}/${REPO}`,
    "--json",
    "body,comments",
  ]);

  const parsed: unknown = JSON.parse(result.stdout);
  if (!isGitHubIssue(parsed)) {
    throw new Error("gh issue view returned an unexpected issue shape");
  }

  return parsed;
}

export async function postComment(body: string): Promise<void> {
  await runCommand(
    "gh",
    ["issue", "comment", String(ISSUE_NUMBER), "--repo", `${OWNER}/${REPO}`, "--body-file", "-"],
    body,
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

async function runCommand(command: string, args: string[], stdin?: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout === null || child.stderr === null) {
      reject(new Error(`${command} did not expose stdout/stderr pipes`));
      return;
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const suffix = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} failed with ${suffix}: ${stderr.trim()}`));
    });

    if (stdin !== undefined) {
      if (child.stdin === null) {
        reject(new Error(`${command} did not expose stdin pipe`));
        return;
      }

      child.stdin.end(stdin);
    }
  });
}

function isGitHubIssue(value: unknown): value is GitHubIssue {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const issue = value as Partial<GitHubIssue>;
  return (
    typeof issue.body === "string" &&
    Array.isArray(issue.comments) &&
    issue.comments.every((comment) => typeof comment === "object" && comment !== null && typeof comment.body === "string")
  );
}
