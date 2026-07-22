## Requirement: Agent identity metadata in frontmatter

Source: docs/product/pages/agent-teams.md#Agent-身份与说明

- Team member `AGENT.md` files MUST store new display identities in leading YAML frontmatter fields `display_name` and `description`.
- `display_name` and `description` MUST be non-empty single-line strings and MUST be treated as one atomic identity pair.
- The member directory name MUST remain the only source of the stable slug; frontmatter MUST NOT duplicate a `name` or slug field.
- The team list row, member selector, current Agent heading, and mention completion MUST prefer the canonical frontmatter identity over persona headings or paragraphs.
- When both canonical identity fields are absent, the desktop MUST preserve legacy compatibility by reading the first level-one persona heading and its first eligible paragraph.
- When only one canonical identity field exists, YAML is invalid, or either canonical value is invalid, the desktop MUST mark the team as needing repair with a visible metadata issue and MUST NOT silently combine canonical and legacy identity sources.
- New member creation MUST emit canonical snake_case identity frontmatter.
- Existing legacy user-team files MUST NOT be rewritten merely because they were read, listed, or saved without an explicit user edit.

### Scenario: Persona heading does not replace the display name

- **GIVEN** a member `AGENT.md` declares `display_name: 开发经理` and `description: 负责技术决策、架构选型与质量保证。`
- **AND** its persona body begins with `# 角色`
- **WHEN** the built-in team and member identity render
- **THEN** the visible member name is `开发经理`
- **AND** the visible description is the frontmatter description
- **AND** `角色` remains persona content only.

### Scenario: Legacy identity remains readable

- **GIVEN** an existing user-team member has no `display_name` or `description` frontmatter
- **AND** its persona body begins with `# 开发经理` followed by `默认接单并组织团队推进`
- **WHEN** the team is loaded after the upgrade
- **THEN** the member remains usable with that legacy display name and description
- **AND** the file is not rewritten automatically.

### Scenario: Partial canonical identity is repairable, not silently mixed

- **GIVEN** a member frontmatter contains `display_name` but omits `description`
- **AND** the persona body contains a legacy description paragraph
- **WHEN** the team is loaded
- **THEN** the team is marked as needing repair for invalid Agent metadata
- **AND** the desktop does not combine the frontmatter name with the legacy paragraph.
