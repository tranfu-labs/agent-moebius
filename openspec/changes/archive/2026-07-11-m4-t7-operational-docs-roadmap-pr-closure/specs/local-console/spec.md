# local-console delta：m4-t7-operational-docs-roadmap-pr-closure

## ADDED Requirements

### Requirement: Operational startup documentation
The local-console domain MUST document the mutually exclusive local and GitHub startup modes.

The operational documentation MUST name the GitHub-mode flag as `--github-mode`.

The operational documentation MUST state the GitHub-mode startup command as `pnpm start -- --github-mode`.

The operational documentation MUST state that bare `pnpm start` enters the default local mode.

The operational documentation MUST state that local mode does not scan or read GitHub issues.

The operational documentation MUST state that GitHub mode does not start the local console SQLite session write path.

The operational documentation MUST state that local SQLite data and GitHub issue/intake state are mutually invisible, not mirrored, and not run concurrently.

The operational documentation MUST state that local mode uses `.state/local-console.sqlite` and GitHub mode uses `.state/github-runner.sqlite`.

The operational documentation MUST instruct operators of a persistent GitHub runner to use `pnpm start -- --github-mode` instead of bare `pnpm start`.

#### Scenario: Operator selects a runtime mode
Given an operator reads the startup documentation
When the operator selects a runtime mode
Then `AGENTS.md` documents `--github-mode` and `pnpm start -- --github-mode`
And `AGENTS.md` states that bare `pnpm start` enters local mode
And `AGENTS.md` states that local mode and GitHub mode use isolated data paths
And `AGENTS.md` tells persistent GitHub runner operators to use the explicit GitHub-mode command.
