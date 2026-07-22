## Requirement: Canonical snake_case Agent capability metadata

- Agent Markdown frontmatter MUST use `workspace_access` and `pre_script` as the canonical capability field names.
- `workspace_access` MUST continue to accept only `write` and `read-run`.
- `pre_script` MUST continue to resolve only through the trusted `src/agent-prescripts/` registry and MUST NOT execute paths supplied by issue content.
- The runner MUST keep read compatibility for legacy `workspaceAccess` and `preScript` fields.
- When canonical and legacy aliases for the same capability coexist with equal values, the runner MAY accept them; when their values differ, parsing MUST fail visibly and MUST NOT silently choose either value.
- Frontmatter MUST be removed from the persona body passed to Codex.
- Repository-owned Agent files and newly generated Agent files MUST write only the canonical snake_case fields.

### Scenario: Legacy workspace capability remains compatible

- **GIVEN** an existing Agent file declares `workspaceAccess: read-run`
- **WHEN** the runner loads its manifest after the upgrade
- **THEN** the workspace capability is `read-run`
- **AND** the remaining Markdown body is unchanged.

### Scenario: Canonical capability drives the existing worktree path

- **GIVEN** `agents/dev.md` declares `workspace_access: write`
- **WHEN** a valid `@dev` trigger reaches workspace preparation
- **THEN** the runner selects the existing built-in issue worktree capability with write access
- **AND** it does not interpret the field value as a script path.

### Scenario: Conflicting aliases fail closed before Codex

- **GIVEN** an Agent frontmatter declares `workspace_access: write` and `workspaceAccess: read-run`
- **WHEN** the runner parses the Agent manifest
- **THEN** parsing fails with an explicit field conflict
- **AND** Codex is not invoked with an ambiguous capability.
