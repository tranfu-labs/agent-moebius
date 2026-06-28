import type { IssueSource } from "../issue-source.js";

export type { IssueSource } from "../issue-source.js";

export interface AgentPreScriptInput {
  role: string;
  preScript: string;
  latestIndex: number;
  issueSource: IssueSource;
  workdirRoot: string;
  contextStatePath: string;
}

export type AgentPreScriptResult =
  | {
      ok: true;
      codexCwd?: string;
    }
  | {
      ok: false;
      reason: string;
    };

export type AgentPreScript = (input: AgentPreScriptInput) => Promise<AgentPreScriptResult>;
